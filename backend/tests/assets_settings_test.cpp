#include "webwb/asset_store.hpp"
#include "webwb/settings_store.hpp"

#include <cassert>
#include <filesystem>
#include <fstream>
#include <string>
#include <unistd.h>

int main() {
    namespace fs = std::filesystem;
    auto directory = fs::temp_directory_path() / ("webwb-media-test-" + std::to_string(::getpid()));
    fs::remove_all(directory);
    try {
        webwb::AssetStore assets(directory);
        webwb::SettingsStore settings(directory);
        assert(settings.read() == R"({"title":"WEBWB"})");
        assert(webwb::SettingsStore::valid(R"({"title":"Test"})"));
        assert(!webwb::SettingsStore::valid(R"({"title":123})"));
        settings.update(R"({"title":"Панель"})");
        assert(settings.read() == R"({"title":"Панель"})");
        webwb::SettingsStore reread(directory);
        assert(reread.read() == R"({"title":"Панель"})");
        const std::string png = std::string("\x89PNG\r\n\x1a\n", 8) +
            std::string("\0\0\0\r", 4) + "IHDR" + std::string(13, '\0');
        const auto id = assets.create(png);
        assert(id.size() == 32);
        assert(assets.list().size() == 1);
        const auto read = assets.read(id);
        assert(read.mime_type == "image/png" && read.bytes == png);
        assets.remove(id);
        assert(assets.list().empty());
        bool invalid = false;
        try { assets.create("hello world"); }
        catch (const webwb::StoreError& e) { invalid = e.kind() == webwb::StoreErrorKind::conflict; }
        assert(invalid);
        fs::remove_all(directory);
        return 0;
    } catch (...) {
        fs::remove_all(directory);
        throw;
    }
}
