#include "webwb/template_store.hpp"
#include "webwb/project_validation.hpp"

#include <algorithm>
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <iomanip>
#include <random>
#include <sstream>
#include <system_error>
#include <unistd.h>

namespace webwb {
namespace {
namespace fs = std::filesystem;

[[noreturn]] void io_error(const std::string& message) {
    throw StoreError(StoreErrorKind::io_error, message + ": " + std::strerror(errno));
}

std::string random_id() {
    std::random_device random;
    std::ostringstream result;
    result << std::hex << std::setfill('0');
    for (int i = 0; i < 4; ++i) result << std::setw(8) << static_cast<std::uint32_t>(random());
    return result.str();
}

bool is_plain_file(const fs::path& path) {
    std::error_code ec;
    const auto status = fs::symlink_status(path, ec);
    if (ec == std::errc::no_such_file_or_directory) return false;
    if (ec) throw StoreError(StoreErrorKind::io_error, "cannot inspect template: " + ec.message());
    return fs::is_regular_file(status);
}

void verify(std::string_view contents) {
    const auto result = validate_template(contents);
    if (!result.valid) throw StoreError(StoreErrorKind::io_error, "invalid stored template: " + result.message);
}

std::string read_file(const fs::path& path) {
    int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) io_error("open template");
    std::string result;
    char buffer[8192];
    for (;;) {
        const ssize_t n = ::read(fd, buffer, sizeof(buffer));
        if (n == 0) break;
        if (n < 0) {
            if (errno == EINTR) continue;
            int saved = errno;
            ::close(fd);
            errno = saved;
            io_error("read template");
        }
        if (result.size() + static_cast<std::size_t>(n) > kMaxProjectBytes) {
            ::close(fd);
            throw StoreError(StoreErrorKind::io_error, "template exceeds 1 MiB");
        }
        result.append(buffer, static_cast<std::size_t>(n));
    }
    if (::close(fd) != 0) io_error("close template");
    verify(result);
    return result;
}

void write_file(const fs::path& dir, const fs::path& target, std::string_view contents) {
    const auto temporary = dir / (".pending-" + random_id());
    const int fd = ::open(temporary.c_str(), O_CREAT | O_EXCL | O_WRONLY | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (fd < 0) io_error("create temporary template");
    bool closed = false;
    try {
        std::size_t offset = 0;
        while (offset < contents.size()) {
            const ssize_t n = ::write(fd, contents.data() + offset, contents.size() - offset);
            if (n < 0 && errno == EINTR) continue;
            if (n <= 0) io_error("write template");
            offset += static_cast<std::size_t>(n);
        }
        if (::fsync(fd) != 0) io_error("sync template");
        if (::close(fd) != 0) { closed = true; io_error("close template"); }
        closed = true;
        // Do not overwrite an existing ID, even if unexpectedly generated twice.
        if (::link(temporary.c_str(), target.c_str()) != 0) {
            if (errno == EEXIST) throw StoreError(StoreErrorKind::conflict, "template ID collision");
            io_error("publish template");
        }
        fs::remove(temporary);
        const int dirfd = ::open(dir.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC);
        if (dirfd >= 0) { ::fsync(dirfd); ::close(dirfd); }
    } catch (...) {
        if (!closed) ::close(fd);
        std::error_code ignored;
        fs::remove(temporary, ignored);
        throw;
    }
}

} // namespace

TemplateStore::TemplateStore(const fs::path& data_directory)
    : directory_(data_directory / "templates") {
    std::error_code ec;
    fs::create_directories(directory_, ec);
    if (ec) throw StoreError(StoreErrorKind::io_error, "create templates directory: " + ec.message());
    const auto status = fs::symlink_status(directory_, ec);
    if (ec || !fs::is_directory(status))
        throw StoreError(StoreErrorKind::io_error, "templates directory is not a real directory");
}

fs::path TemplateStore::file_for(std::string_view id) const {
    if (!ProjectStore::valid_project_id(id))
        throw StoreError(StoreErrorKind::not_found, "template not found");
    return directory_ / (std::string(id) + ".json");
}

std::vector<TemplateRecord> TemplateStore::list() const {
    std::vector<TemplateRecord> records;
    std::error_code ec;
    fs::directory_iterator it(directory_, ec);
    if (ec) throw StoreError(StoreErrorKind::io_error, "list templates: " + ec.message());
    for (const auto& entry : it) {
        const auto filename = entry.path().filename().string();
        if (filename.size() != 37 || entry.path().extension() != ".json") continue;
        const auto id = filename.substr(0, 32);
        if (!ProjectStore::valid_project_id(id) || !is_plain_file(entry.path())) continue;
        records.push_back({id, read_file(entry.path())});
        if (records.size() > kMaxTemplates)
            throw StoreError(StoreErrorKind::io_error, "template count exceeds limit");
    }
    std::sort(records.begin(), records.end(), [](const auto& a, const auto& b) {return a.id < b.id;});
    return records;
}

std::string TemplateStore::create(std::string_view document) {
    verify(document);
    if (list().size() >= kMaxTemplates)
        throw StoreError(StoreErrorKind::limit_reached, "only 30 templates allowed");
    for (int tries = 0; tries < 12; ++tries) {
        const auto id = random_id();
        const auto target = file_for(id);
        std::error_code ec;
        if (fs::exists(target, ec)) continue;
        if (ec) throw StoreError(StoreErrorKind::io_error, "check template ID: " + ec.message());
        try {
            write_file(directory_, target, document);
            return id;
        } catch (const StoreError& error) {
            if (error.kind() != StoreErrorKind::conflict) throw;
        }
    }
    throw StoreError(StoreErrorKind::io_error, "cannot allocate template ID");
}

void TemplateStore::remove(std::string_view id) {
    const auto path = file_for(id);
    if (!is_plain_file(path)) throw StoreError(StoreErrorKind::not_found, "template not found");
    std::error_code ec;
    if (!fs::remove(path, ec)) {
        if (ec) throw StoreError(StoreErrorKind::io_error, "remove template: " + ec.message());
        throw StoreError(StoreErrorKind::not_found, "template not found");
    }
}

} // namespace webwb
