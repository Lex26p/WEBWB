#include "webwb/asset_store.hpp"

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

constexpr std::size_t kMaxImageBytes = 1024 * 1024;

[[noreturn]] void fail(const char* operation) {
    throw StoreError(StoreErrorKind::io_error, std::string(operation) + ": " + std::strerror(errno));
}

void ensure_directory(const fs::path& path) {
    std::error_code ec;
    fs::create_directories(path, ec);
    if (ec) throw StoreError(StoreErrorKind::io_error, "create uploads directory: " + ec.message());
    const auto status = fs::symlink_status(path, ec);
    if (ec || !fs::is_directory(status))
        throw StoreError(StoreErrorKind::io_error, "uploads path must be a directory");
}

std::string random_id() {
    std::random_device random;
    std::ostringstream output;
    output << std::hex << std::setfill('0');
    for (int i = 0; i != 4; ++i)
        output << std::setw(8) << static_cast<std::uint32_t>(random());
    return output.str();
}

struct Format { const char* suffix; const char* mime; };

const Format* detect_format(std::string_view data) {
    static const Format png{".png", "image/png"};
    static const Format jpeg{".jpg", "image/jpeg"};
    static const Format webp{".webp", "image/webp"};
    if (data.size() >= 24 && data.substr(0, 8) == "\x89PNG\r\n\x1a\n" &&
        data.substr(12, 4) == "IHDR") return &png;
    if (data.size() >= 4 && static_cast<unsigned char>(data[0]) == 0xff &&
        static_cast<unsigned char>(data[1]) == 0xd8 &&
        static_cast<unsigned char>(data[data.size()-2]) == 0xff &&
        static_cast<unsigned char>(data.back()) == 0xd9) return &jpeg;
    if (data.size() >= 16 && data.substr(0, 4) == "RIFF" &&
        data.substr(8, 4) == "WEBP" &&
        (data.substr(12, 4) == "VP8 " || data.substr(12, 4) == "VP8L" || data.substr(12, 4) == "VP8X")) return &webp;
    return nullptr;
}

const Format* format_from_suffix(std::string_view suffix) {
    static const Format png{".png", "image/png"};
    static const Format jpg{".jpg", "image/jpeg"};
    static const Format webp{".webp", "image/webp"};
    if (suffix == ".png") return &png;
    if (suffix == ".jpg") return &jpg;
    if (suffix == ".webp") return &webp;
    return nullptr;
}

fs::path find_path(const fs::path& directory, std::string_view id) {
    if (!ProjectStore::valid_project_id(id))
        throw StoreError(StoreErrorKind::not_found, "image not found");
    for (auto suffix : {".png", ".jpg", ".webp"}) {
        const auto p = directory / (std::string(id) + suffix);
        std::error_code ec;
        const auto status = fs::symlink_status(p, ec);
        if (ec == std::errc::no_such_file_or_directory) continue;
        if (ec) throw StoreError(StoreErrorKind::io_error, "inspect image: " + ec.message());
        if (fs::is_regular_file(status)) return p;
    }
    throw StoreError(StoreErrorKind::not_found, "image not found");
}

void sync_directory(const fs::path& path) {
    const int fd = ::open(path.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (fd >= 0) { ::fsync(fd); ::close(fd); }
}

} // namespace

AssetStore::AssetStore(const fs::path& directory) : directory_(directory / "uploads") {
    ensure_directory(directory_);
}

std::vector<AssetInfo> AssetStore::list() const {
    std::vector<AssetInfo> result;
    std::error_code ec;
    fs::directory_iterator it(directory_, ec);
    if (ec) throw StoreError(StoreErrorKind::io_error, "list images: " + ec.message());
    for (const auto& entry : it) {
        const auto path = entry.path();
        const auto id = path.stem().string();
        const auto* fmt = format_from_suffix(path.extension().string());
        if (!fmt || !ProjectStore::valid_project_id(id)) continue;
        if (!entry.is_regular_file(ec)) {
            if (ec) throw StoreError(StoreErrorKind::io_error, "inspect images: " + ec.message());
            continue;
        }
        const auto size = entry.file_size(ec);
        if (ec) throw StoreError(StoreErrorKind::io_error, "image size: " + ec.message());
        result.push_back({id, fmt->mime, static_cast<std::size_t>(size)});
    }
    std::sort(result.begin(), result.end(), [](const auto& a, const auto& b) {return a.id < b.id;});
    return result;
}

std::string AssetStore::create(std::string_view bytes) {
    if (bytes.empty() || bytes.size() > kMaxImageBytes)
        throw StoreError(StoreErrorKind::conflict, "image size must be 1 byte to 1 MiB");
    const auto* fmt = detect_format(bytes);
    if (!fmt) throw StoreError(StoreErrorKind::conflict, "only PNG, JPEG and WebP images are supported");
    for (int attempt = 0; attempt < 10; ++attempt) {
        const auto id = random_id();
        const auto target = directory_ / (id + fmt->suffix);
        const int fd = ::open(target.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
        if (fd == -1 && errno == EEXIST) continue;
        if (fd == -1) fail("create image");
        try {
            std::size_t offset = 0;
            while (offset < bytes.size()) {
                auto n = ::write(fd, bytes.data() + offset, bytes.size() - offset);
                if (n < 0 && errno == EINTR) continue;
                if (n <= 0) fail("write image");
                offset += static_cast<std::size_t>(n);
            }
            if (::fsync(fd) != 0) fail("sync image");
            if (::close(fd) != 0) fail("close image");
            sync_directory(directory_);
            return id;
        } catch (...) {
            ::close(fd);
            std::error_code ignored;
            fs::remove(target, ignored);
            throw;
        }
    }
    throw StoreError(StoreErrorKind::io_error, "unable to allocate image id");
}

AssetData AssetStore::read(std::string_view id) const {
    const auto path = find_path(directory_, id);
    const auto* fmt = format_from_suffix(path.extension().string());
    const int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd == -1) fail("open image");
    std::string bytes;
    char block[8192];
    for (;;) {
        const auto n = ::read(fd, block, sizeof(block));
        if (n < 0 && errno == EINTR) continue;
        if (n < 0) { ::close(fd); fail("read image"); }
        if (n == 0) break;
        if (bytes.size() + static_cast<std::size_t>(n) > kMaxImageBytes) {
            ::close(fd);
            throw StoreError(StoreErrorKind::io_error, "image exceeds 1 MiB");
        }
        bytes.append(block, static_cast<std::size_t>(n));
    }
    if (::close(fd) != 0) fail("close image");
    if (detect_format(bytes) == nullptr)
        throw StoreError(StoreErrorKind::io_error, "stored image has an invalid format");
    return {fmt->mime, std::move(bytes)};
}

void AssetStore::remove(std::string_view id) {
    const auto path = find_path(directory_, id);
    std::error_code ec;
    fs::remove(path, ec);
    if (ec) throw StoreError(StoreErrorKind::io_error, "delete image: " + ec.message());
    sync_directory(directory_);
}

} // namespace webwb
