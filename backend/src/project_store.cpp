#include "webwb/project_store.hpp"
#include "webwb/project_validation.hpp"

#include <json-c/json.h>

#include <algorithm>
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <fstream>
#include <iomanip>
#include <memory>
#include <random>
#include <sstream>
#include <system_error>
#include <unistd.h>

namespace webwb {
namespace {
namespace fs = std::filesystem;

[[noreturn]] void fail(const std::string& operation, const std::error_code& ec) {
    throw StoreError(StoreErrorKind::io_error, operation + ": " + ec.message());
}

[[noreturn]] void fail_errno(const std::string& operation) {
    throw StoreError(StoreErrorKind::io_error, operation + ": " + std::strerror(errno));
}

void check_json(std::string_view contents) {
    const auto result = validate_project(contents);
    if (!result.valid) {
        throw StoreError(StoreErrorKind::io_error, "stored project is invalid: " + result.message);
    }
}

std::string title_from_json(std::string_view contents) {
    std::string source(contents);
    std::unique_ptr<json_object, decltype(&json_object_put)> obj(json_tokener_parse(source.c_str()), json_object_put);
    if (!obj) throw StoreError(StoreErrorKind::io_error, "stored project JSON cannot be parsed");
    json_object* title = nullptr;
    if (!json_object_object_get_ex(obj.get(), "title", &title) || !json_object_is_type(title, json_type_string)) {
        throw StoreError(StoreErrorKind::io_error, "stored project is missing its title");
    }
    return json_object_get_string(title);
}

std::string random_id() {
    std::random_device random;
    std::ostringstream out;
    out << std::hex << std::setfill('0');
    for (int i = 0; i < 4; ++i) out << std::setw(8) << static_cast<std::uint32_t>(random());
    return out.str();
}

bool is_regular_file_without_link(const fs::path& path) {
    std::error_code ec;
    const auto status = fs::symlink_status(path, ec);
    if (ec == std::errc::no_such_file_or_directory) return false;
    if (ec) fail("inspect file", ec);
    return fs::is_regular_file(status);
}

// POSIX descriptor ensures a symlink cannot be followed between validation and reading.
std::string read_file(const fs::path& path) {
    const int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) {
        if (errno == ENOENT) throw StoreError(StoreErrorKind::not_found, "project not found");
        fail_errno("open project");
    }
    std::string contents;
    contents.reserve(4096);
    char buffer[8192];
    for (;;) {
        const auto n = ::read(fd, buffer, sizeof(buffer));
        if (n == 0) break;
        if (n < 0) {
            if (errno == EINTR) continue;
            const int err = errno;
            ::close(fd);
            errno = err;
            fail_errno("read project");
        }
        if (contents.size() + static_cast<std::size_t>(n) > kMaxProjectBytes) {
            ::close(fd);
            throw StoreError(StoreErrorKind::io_error, "stored project exceeds 1 MiB");
        }
        contents.append(buffer, static_cast<std::size_t>(n));
    }
    if (::close(fd) != 0) fail_errno("close project");
    check_json(contents);
    return contents;
}

void ensure_directory(const fs::path& path) {
    std::error_code ec;
    fs::create_directories(path, ec);
    if (ec) fail("create projects directory", ec);
    const auto status = fs::symlink_status(path, ec);
    if (ec) fail("inspect projects directory", ec);
    if (!fs::is_directory(status)) {
        throw StoreError(StoreErrorKind::io_error, "projects path is not a real directory");
    }
}

} // namespace

ProjectStore::ProjectStore(const fs::path& data_directory)
    : projects_directory_(data_directory / "projects") {
    ensure_directory(projects_directory_);
}

bool ProjectStore::valid_project_id(std::string_view id) noexcept {
    if (id.size() != 32) return false;
    for (const char c : id) {
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
    }
    return true;
}

fs::path ProjectStore::file_for(std::string_view id) const {
    if (!valid_project_id(id)) throw StoreError(StoreErrorKind::not_found, "project not found");
    return projects_directory_ / (std::string(id) + ".json");
}

std::vector<ProjectSummary> ProjectStore::list() const {
    std::vector<ProjectSummary> summaries;
    std::error_code ec;
    fs::directory_iterator it(projects_directory_, ec);
    if (ec) fail("list projects", ec);
    for (const auto& entry : it) {
        const auto name = entry.path().filename().string();
        if (entry.path().extension() != ".json" || name.size() != 37) continue;
        const auto id = name.substr(0, 32);
        if (!valid_project_id(id) || !is_regular_file_without_link(entry.path())) continue;
        const auto contents = read_file(entry.path());
        summaries.push_back({id, title_from_json(contents)});
    }
    std::sort(summaries.begin(), summaries.end(), [](const auto& a, const auto& b) { return a.id < b.id; });
    return summaries;
}

void ProjectStore::write_atomically(const fs::path& target, std::string_view contents) {
    const auto temporary = projects_directory_ / (".pending-" + random_id());
    const int fd = ::open(temporary.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (fd < 0) fail_errno("create temporary project file");
    try {
        std::size_t offset = 0;
        while (offset < contents.size()) {
            const auto written = ::write(fd, contents.data() + offset, contents.size() - offset);
            if (written < 0 && errno == EINTR) continue;
            if (written <= 0) fail_errno("write project");
            offset += static_cast<std::size_t>(written);
        }
        if (::fsync(fd) != 0) fail_errno("sync project");
        if (::close(fd) != 0) fail_errno("close temporary project");
    } catch (...) {
        ::close(fd);
        std::error_code ignored;
        fs::remove(temporary, ignored);
        throw;
    }
    std::error_code ec;
    fs::rename(temporary, target, ec);
    if (ec) {
        std::error_code ignored;
        fs::remove(temporary, ignored);
        fail("replace project", ec);
    }
    // Make directory changes durable across reboot where supported.
    const int dirfd = ::open(projects_directory_.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (dirfd >= 0) {
        ::fsync(dirfd);
        ::close(dirfd);
    }
}

std::string ProjectStore::create(std::string_view project_json) {
    // API validates before calling us; validate here too for direct library users.
    check_json(project_json);
    for (int attempt = 0; attempt < 12; ++attempt) {
        const auto id = random_id();
        const auto target = file_for(id);
        std::error_code ec;
        if (fs::exists(target, ec)) continue;
        if (ec) fail("inspect destination", ec);
        write_atomically(target, project_json);
        return id;
    }
    throw StoreError(StoreErrorKind::io_error, "unable to allocate a project id");
}

std::string ProjectStore::read(std::string_view id) const {
    const auto path = file_for(id);
    if (!is_regular_file_without_link(path)) throw StoreError(StoreErrorKind::not_found, "project not found");
    return read_file(path);
}

void ProjectStore::update(std::string_view id, std::string_view project_json) {
    check_json(project_json);
    const auto target = file_for(id);
    if (!is_regular_file_without_link(target)) throw StoreError(StoreErrorKind::not_found, "project not found");
    write_atomically(target, project_json);
}

void ProjectStore::remove(std::string_view id) {
    const auto target = file_for(id);
    if (!is_regular_file_without_link(target)) throw StoreError(StoreErrorKind::not_found, "project not found");
    std::error_code ec;
    const bool removed = fs::remove(target, ec);
    if (ec) fail("delete project", ec);
    if (!removed) throw StoreError(StoreErrorKind::not_found, "project not found");
}

} // namespace webwb
