#pragma once

#include "webwb/project_store.hpp"

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace webwb {

constexpr std::size_t kMaxTemplates = 30;

struct TemplateRecord {
    std::string id;
    std::string document; // Validated {name,node}, without server ID.
};

class TemplateStore {
public:
    explicit TemplateStore(const std::filesystem::path& data_directory);
    std::vector<TemplateRecord> list() const;
    std::string create(std::string_view document);
    void remove(std::string_view id);

private:
    std::filesystem::path directory_;
    std::filesystem::path file_for(std::string_view id) const;
};

} // namespace webwb
