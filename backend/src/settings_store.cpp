#include "webwb/settings_store.hpp"
#include <json-c/json.h>

#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <memory>
#include <string>
#include <system_error>
#include <unistd.h>

namespace webwb {
namespace {
namespace fs = std::filesystem;

[[noreturn]] void fail(const char* operation) {
    throw StoreError(StoreErrorKind::io_error, std::string(operation) + ": " + std::strerror(errno));
}

} // namespace

SettingsStore::SettingsStore(const fs::path& data_dir) : path_(data_dir / "settings.json") {
    std::error_code ec;
    fs::create_directories(data_dir, ec);
    if (ec) throw StoreError(StoreErrorKind::io_error, "create settings directory: " + ec.message());
}

bool SettingsStore::valid(std::string_view document) {
    if (document.empty() || document.size() > 4096) return false;
    std::unique_ptr<json_tokener, decltype(&json_tokener_free)> parser(json_tokener_new_ex(16), json_tokener_free);
    std::unique_ptr<json_object, decltype(&json_object_put)> obj(
        json_tokener_parse_ex(parser.get(), document.data(), static_cast<int>(document.size())), json_object_put);
    if (json_tokener_get_error(parser.get()) != json_tokener_success ||
        !json_object_is_type(obj.get(), json_type_object)) return false;
    for (std::size_t i=json_tokener_get_parse_end(parser.get()); i<document.size(); ++i)
        if (document[i] != ' ' && document[i] != '\n' && document[i] != '\r' && document[i] != '\t') return false;
    json_object* title = nullptr;
    if (!json_object_object_get_ex(obj.get(), "title", &title) ||
        !json_object_is_type(title, json_type_string)) return false;
    if (json_object_object_length(obj.get()) != 1) return false;
    const std::string text(json_object_get_string(title),
                           static_cast<std::size_t>(json_object_get_string_len(title)));
    if (text.empty() || text.size() > 120) return false;
    for (unsigned char c : text) if (c < 32 || c == 127) return false;
    return true;
}

std::string SettingsStore::read() const {
    const int fd = ::open(path_.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0 && errno == ENOENT) return R"({"title":"WEBWB"})";
    if (fd < 0) fail("read settings");
    std::string data;
    char buffer[1024];
    for (;;) {
        const auto n = ::read(fd, buffer, sizeof(buffer));
        if (n < 0 && errno == EINTR) continue;
        if (n < 0) { ::close(fd); fail("read settings"); }
        if (n == 0) break;
        if (data.size() + static_cast<std::size_t>(n) > 4096) {
            ::close(fd); throw StoreError(StoreErrorKind::io_error, "settings file too large");
        }
        data.append(buffer, static_cast<std::size_t>(n));
    }
    if (::close(fd) != 0) fail("close settings");
    if (!valid(data)) throw StoreError(StoreErrorKind::io_error, "invalid settings on disk");
    return data;
}

void SettingsStore::update(std::string_view document) {
    if (!valid(document)) throw StoreError(StoreErrorKind::conflict, "invalid settings JSON");
    const auto temporary = path_.parent_path() / ".settings-pending";
    const int fd = ::open(temporary.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (fd < 0) fail("create temporary settings");
    bool closed = false;
    try {
        std::size_t offset = 0;
        while (offset < document.size()) {
            auto n = ::write(fd, document.data()+offset, document.size()-offset);
            if (n < 0 && errno == EINTR) continue;
            if (n <= 0) fail("write settings");
            offset += static_cast<std::size_t>(n);
        }
        if (::fsync(fd) != 0) fail("sync settings");
        if (::close(fd) != 0) fail("close settings");
        closed = true;
        std::error_code ec;
        fs::rename(temporary, path_, ec);
        if (ec) throw StoreError(StoreErrorKind::io_error, "replace settings: " + ec.message());
        const int dirfd = ::open(path_.parent_path().c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC);
        if (dirfd >= 0) { ::fsync(dirfd); ::close(dirfd); }
    } catch (...) {
        if (!closed) ::close(fd);
        std::error_code ignored;
        fs::remove(temporary, ignored);
        throw;
    }
}

} // namespace webwb
