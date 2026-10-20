#pragma once

#include "webwb/project_store.hpp"

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace webwb {

struct AssetInfo {
    std::string id;
    std::string mime_type;
    std::size_t size;
};

struct AssetData {
    std::string mime_type;
    std::string bytes;
};

// Binary images only. IDs are generated server-side; client filenames are ignored.
class AssetStore {
public:
    explicit AssetStore(const std::filesystem::path& directory);
    std::vector<AssetInfo> list() const;
    std::string create(std::string_view bytes);
    AssetData read(std::string_view id) const;
    void remove(std::string_view id);

private:
    std::filesystem::path directory_;
};

} // namespace webwb
