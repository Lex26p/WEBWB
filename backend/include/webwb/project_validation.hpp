#pragma once

#include <cstddef>
#include <string>
#include <string_view>

namespace webwb {

constexpr int kProjectFormatVersion = 3;
constexpr std::size_t kMaxProjectBytes = 1024 * 1024;

struct ValidationResult {
    bool valid = false;
    std::string message;
};

// Checks the version-3 JSON format exported by frontend/js/model.js.
// This function does not normalize, modify, or save project data.
ValidationResult validate_project(std::string_view source);

} // namespace webwb
