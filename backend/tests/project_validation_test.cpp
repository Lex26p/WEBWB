#include "webwb/project_validation.hpp"

#include <fstream>
#include <iostream>
#include <iterator>
#include <string>

namespace {
int failures = 0;

void expect(std::string name, const std::string& body, bool should_pass) {
    const auto result = webwb::validate_project(body);
    if (result.valid != should_pass) {
        ++failures;
        std::cerr << "FAIL: " << name << " (" << result.message << ")\n";
    }
}

std::string minimal_node(std::string id) {
    return "{\"id\":\"" + id + "\",\"type\":\"container\",\"name\":\"DIV\",\"style\":{},\"children\":[]}";
}

std::string project_with_root(const std::string& root) {
    return "{\"version\":3,\"title\":\"Test\",\"root\":" + root + "}";
}

} // namespace

int main() {
    std::ifstream file(WEBWB_SAMPLE_PROJECT);
    if (!file) {
        std::cerr << "Cannot read example project\n";
        return 1;
    }
    const std::string example((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    expect("real exported v3 demo", example, true);
    expect("invalid JSON", "{", false);
    expect("trailing characters", example + "false", false);
    expect("non-object root", R"({"version":3,"title":"x","root":[]})", false);
    expect("old version", R"({"version":2,"title":"x","root":{}})", false);
    expect("wrong top-level version type", R"({"version":"3","title":"x","root":{}})", false);
    expect("minimal project", project_with_root(minimal_node("page")), true);
    expect("invalid id", project_with_root(minimal_node("bad id")), false);
    expect("bad child type", project_with_root(R"({"id":"a","type":"container","name":"x","style":{},"children":[{"id":"b","type":"device","name":"x","style":{}}]})"), false);
    expect("duplicate id", project_with_root(R"({"id":"a","type":"container","name":"x","style":{},"children":[{"id":"a","type":"text","name":"x","style":{},"text":"Hi"}]})"), false);
    expect("wrong style type", project_with_root(R"({"id":"a","type":"container","name":"x","style":{"width":false},"children":[]})"), false);
    expect("unknown CSS property", project_with_root(R"({"id":"a","type":"container","name":"x","style":{"evil":"foo"},"children":[]})"), false);
    expect("invalid switch state", project_with_root(R"({"id":"a","type":"container","name":"x","style":{},"children":[{"id":"b","type":"switch","name":"x","style":{},"checked":"true"}]})"), false);
    expect("valid Cyrillic text", project_with_root(R"({"id":"a","type":"container","name":"Страница","style":{},"children":[]})"), true);
    expect("invalid slider range", project_with_root(R"({"id":"a","type":"container","name":"x","style":{},"children":[{"id":"b","type":"slider","name":"x","text":"x","style":{},"min":0,"max":100,"step":1,"value":101}]})"), false);
    expect("unexpected children on leaf", project_with_root(R"({"id":"a","type":"text","name":"x","style":{},"text":"Hi","children":[]})"), false);
    expect("valid mqtt text binding", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"text","name":"x","style":{},"text":"Temp","mqtt":{"statusTopic":"/devices/demo/controls/Temp"}}]})"), true);
    expect("valid mqtt switch binding", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"switch","name":"x","style":{},"checked":false,"mqtt":{"statusTopic":"/devices/demo/controls/State","activeValue":"1"}}]})"), true);
    expect("reject wildcard topic", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"text","name":"x","style":{},"text":"Hi","mqtt":{"statusTopic":"/devices/#"}}]})"), false);
    expect("reject unsupported mqtt commandTopic", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"button","name":"x","style":{},"text":"Hi","mqtt":{"actionTopic":"demo/on","commandTopic":"other"}}]})"), false);
    expect("button action-only", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"button","name":"x","style":{},"text":"Go","mqtt":{"actionTopic":"/devices/demo/controls/State/on","actionValue":"1"}}]})"), true);
    expect("button state and action", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"button","name":"x","style":{},"text":"Go","mqtt":{"statusTopic":"demo","activeValue":"1","actionTopic":"demo/on","actionValue":"0"}}]})"), true);
    expect("switch state and action", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"switch","name":"x","style":{},"checked":false,"mqtt":{"statusTopic":"demo","activeValue":"1","actionTopic":"demo/on","onValue":"1","offValue":"0"}}]})"), true);
    expect("slider action-only", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"slider","name":"x","style":{},"text":"d","min":0,"max":100,"step":1,"value":50,"mqtt":{"actionTopic":"demo/level/on"}}]})"), true);
    expect("reject command for text", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"text","name":"x","style":{},"text":"x","mqtt":{"actionTopic":"demo/on"}}]})"), false);
    expect("reject wildcard action", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"button","name":"x","style":{},"text":"x","mqtt":{"actionTopic":"demo/#"}}]})"), false);
    expect("reject bad action value type", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[{"id":"t","type":"button","name":"x","style":{},"text":"x","mqtt":{"actionTopic":"demo/on","actionValue":42}}]})"), false);
    expect("reject mqtt on container", project_with_root(R"({"id":"r","type":"container","name":"x","style":{},"children":[],"mqtt":{"statusTopic":"demo"}})"), false);
    expect("excessive bytes", std::string(webwb::kMaxProjectBytes + 1, 'x'), false);

    std::string nested = minimal_node("leaf");
    for (int i = 0; i < 21; ++i) {
        nested = "{\"id\":\"n" + std::to_string(i) +
                 "\",\"type\":\"container\",\"name\":\"x\",\"style\":{},\"children\":[" + nested + "]}";
    }
    expect("depth limit", project_with_root(nested), false);
    std::string wide = "{\"id\":\"root\",\"type\":\"container\",\"name\":\"x\",\"style\":{},\"children\":[";
    for (int i = 0; i < 400; ++i) {
        if (i) wide += ',';
        wide += "{\"id\":\"t" + std::to_string(i) + "\",\"type\":\"text\",\"name\":\"x\",\"style\":{},\"text\":\"hi\"}";
    }
    wide += "]}";
    expect("count limit", project_with_root(wide), false);

    std::cout << "Project validation: " << (failures ? "FAILED" : "OK") << '\n';
    return failures ? 1 : 0;
}
