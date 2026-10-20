#pragma once

#include <filesystem>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace webwb {

struct ProjectSummary {
    std::string id;
    std::string title;
};

enum class StoreErrorKind { not_found, io_error };

class StoreError : public std::runtime_error {
public:
    StoreError(StoreErrorKind kind, const std::string& message)
        : std::runtime_error(message), kind_(kind) {}

    StoreErrorKind kind() const noexcept { return kind_; }

private:
    StoreErrorKind kind_;
};

// Keeps one validated version-3 JSON document per file in <data_dir>/projects/.
// Files are replaced by rename of a fully written temporary file.
class ProjectStore {
public:
    explicit ProjectStore(const std::filesystem::path& data_directory);

    std::vector<ProjectSummary> list() const;
    std::string create(std::string_view project_json);
    std::string read(std::string_view id) const;
    void update(std::string_view id, std::string_view project_json);
    void remove(std::string_view id);

    static bool valid_project_id(std::string_view id) noexcept;

private:
    std::filesystem::path projects_directory_;

    std::filesystem::path file_for(std::string_view id) const;
    void write_atomically(const std::filesystem::path& target, std::string_view contents);
};

} // namespace webwb
