#include "webwb/project_validation.hpp"

#include <json-c/json.h>

#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_set>

namespace webwb {
namespace {

constexpr std::size_t kMaxNodes = 400;
constexpr int kMaxDepth = 20; // Root is at depth zero.

using JsonValue = std::unique_ptr<json_object, decltype(&json_object_put)>;
using JsonParser = std::unique_ptr<json_tokener, decltype(&json_tokener_free)>;

bool get_field(json_object* object, const char* name, json_object*& value) {
    return json_object_is_type(object, json_type_object) &&
           json_object_object_get_ex(object, name, &value);
}

bool is_string(json_object* value, std::size_t max_characters) {
    if (!json_object_is_type(value, json_type_string)) return false;
    // Count UTF-8 code points rather than bytes so Cyrillic names work.
    const char* utf8 = json_object_get_string(value);
    const auto bytes = static_cast<std::size_t>(json_object_get_string_len(value));
    std::size_t characters = 0;
    for (std::size_t i = 0; i < bytes; ++i) {
        const auto byte = static_cast<unsigned char>(utf8[i]);
        if (byte == 0) return false;
        if ((byte & 0xC0) != 0x80 && ++characters > max_characters) return false;
    }
    return true;
}

bool has_text(json_object* object, const char* key, std::size_t max_characters) {
    json_object* value = nullptr;
    return get_field(object, key, value) && is_string(value, max_characters);
}

bool valid_id(json_object* value) {
    if (!is_string(value, 80)) return false;
    const std::string id = json_object_get_string(value);
    if (id.empty()) return false;
    for (const unsigned char ch : id) {
        if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
              (ch >= '0' && ch <= '9') || ch == '_' || ch == '-')) return false;
    }
    return true;
}

bool valid_number(json_object* value, double min, double max, double& result) {
    if (!json_object_is_type(value, json_type_int) &&
        !json_object_is_type(value, json_type_double)) return false;
    result = json_object_get_double(value);
    return std::isfinite(result) && result >= min && result <= max;
}

bool valid_style_key(std::string_view key) {
    constexpr std::array<std::string_view, 26> keys = {
        "display", "flexDirection", "justifyContent", "alignItems", "flexWrap",
        "width", "height", "backgroundColor", "color", "borderRadius",
        "borderWidth", "borderColor", "fontSize", "fontWeight", "textAlign",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "marginTop", "marginRight", "marginBottom", "marginLeft",
        "left", "top", "position"
    };
    for (auto candidate : keys) if (candidate == key) return true;
    return false;
}

struct State {
    std::size_t count = 0;
    std::unordered_set<std::string> ids;
    std::string error;

    bool reject(const std::string& location, std::string_view reason) {
        error = location + ": " + std::string(reason);
        return false;
    }
};

bool validate_node(json_object* node, const std::string& location, int depth, State& state) {
    if (depth > kMaxDepth) return state.reject(location, "nesting exceeds 20 levels");
    if (++state.count > kMaxNodes) return state.reject(location, "more than 400 elements");
    if (!json_object_is_type(node, json_type_object)) return state.reject(location, "expected an object");

    json_object* id = nullptr;
    if (!get_field(node, "id", id) || !valid_id(id))
        return state.reject(location, "invalid id (use 1-80 ASCII letters, digits, _ or -)");
    if (!state.ids.insert(json_object_get_string(id)).second)
        return state.reject(location, "duplicate element id");
    if (!has_text(node, "name", 150)) return state.reject(location, "name must be a string up to 150 characters");

    json_object* type_value = nullptr;
    if (!get_field(node, "type", type_value) || !is_string(type_value, 20))
        return state.reject(location, "missing or invalid element type");
    const std::string_view type = json_object_get_string(type_value);
    if (type != "container" && type != "text" && type != "button" &&
        type != "switch" && type != "slider")
        return state.reject(location, "unsupported element type");

    json_object* style = nullptr;
    if (!get_field(node, "style", style) || !json_object_is_type(style, json_type_object))
        return state.reject(location, "style must be an object");
    json_object_object_foreach(style, key, val) {
        if (!valid_style_key(key) || !is_string(val, 120))
            return state.reject(location, "style contains an unsupported property or non-string value");
    }

    if (type == "text" || type == "button" || type == "slider") {
        if (!has_text(node, "text", 10000))
            return state.reject(location, "text must be a string up to 10000 characters");
    }

    if (type == "switch") {
        json_object* checked = nullptr;
        if (!get_field(node, "checked", checked) || !json_object_is_type(checked, json_type_boolean))
            return state.reject(location, "checked must be a boolean");
    }

    if (type == "slider") {
        double minimum = 0, maximum = 0, step = 0, value = 0;
        json_object *min_json = nullptr, *max_json = nullptr, *step_json = nullptr, *value_json = nullptr;
        if (!get_field(node, "min", min_json) || !valid_number(min_json, -10000, 10000, minimum) ||
            !get_field(node, "max", max_json) || !valid_number(max_json, minimum + 1, 10001, maximum) ||
            !get_field(node, "step", step_json) || !valid_number(step_json, 1, 10000, step) ||
            !get_field(node, "value", value_json) || !valid_number(value_json, minimum, maximum, value))
            return state.reject(location, "invalid slider min/max/step/value");
    }

    json_object* children = nullptr;
    if (type == "container") {
        if (!get_field(node, "children", children) || !json_object_is_type(children, json_type_array))
            return state.reject(location, "container must have a children array");
        const auto n = json_object_array_length(children);
        if (n > kMaxNodes) return state.reject(location, "too many children");
        for (std::size_t index = 0; index < n; ++index) {
            if (!validate_node(json_object_array_get_idx(children, index),
                               location + ".children[" + std::to_string(index) + "]", depth + 1, state))
                return false;
        }
    } else if (get_field(node, "children", children)) {
        return state.reject(location, "only containers may have children");
    }
    return true;
}

} // namespace

ValidationResult validate_project(std::string_view source) {
    if (source.empty() || source.size() > kMaxProjectBytes ||
        source.size() > static_cast<std::size_t>(std::numeric_limits<int>::max()))
        return {false, "project JSON must be between 1 byte and 1 MiB"};

    JsonParser parser(json_tokener_new_ex(128), &json_tokener_free);
    if (!parser) return {false, "unable to initialize JSON parser"};
    JsonValue project(json_tokener_parse_ex(parser.get(), source.data(),
                                          static_cast<int>(source.size())), &json_object_put);
    if (json_tokener_get_error(parser.get()) != json_tokener_success) {
        return {false, std::string("malformed JSON: ") +
                       json_tokener_error_desc(json_tokener_get_error(parser.get()))};
    }
    const auto used = json_tokener_get_parse_end(parser.get());
    for (std::size_t pos = used; pos < source.size(); ++pos) {
        if (source[pos] != ' ' && source[pos] != '\t' && source[pos] != '\r' && source[pos] != '\n')
            return {false, "unexpected content after JSON document"};
    }
    if (!json_object_is_type(project.get(), json_type_object))
        return {false, "project must be a JSON object"};

    json_object* version = nullptr;
    if (!get_field(project.get(), "version", version) ||
        !json_object_is_type(version, json_type_int) ||
        json_object_get_int64(version) != kProjectFormatVersion)
        return {false, "unsupported project version (expected 3)"};
    if (!has_text(project.get(), "title", 120))
        return {false, "title must be a string up to 120 characters"};

    json_object* root = nullptr;
    if (!get_field(project.get(), "root", root) || !json_object_is_type(root, json_type_object))
        return {false, "root must be an object"};
    json_object* root_type = nullptr;
    if (!get_field(root, "type", root_type) || !json_object_is_type(root_type, json_type_string) ||
        std::string_view(json_object_get_string(root_type)) != "container")
        return {false, "root element must be a container"};

    State state;
    if (!validate_node(root, "root", 0, state)) return {false, std::move(state.error)};
    return {true, {}};
}

} // namespace webwb
