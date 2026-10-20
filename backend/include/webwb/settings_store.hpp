#pragma once

#include "webwb/project_store.hpp"

#include <filesystem>
#include <string>
#include <string_view>

namespace webwb {

// Small JSON settings document. No database or automatic defaults written to disk.
class SettingsStore {
public:
    explicit SettingsStore(const std::filesystem::path& data_directory);
    std::string read() const;
    void update(std::string_view document);
    static bool valid(std::string_view document);
private:
    std::filesystem::path path_;
};

} // namespace webwb
