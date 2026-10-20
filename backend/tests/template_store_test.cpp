#include "webwb/template_store.hpp"
#include "webwb/project_validation.hpp"

#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <unistd.h>

namespace fs = std::filesystem;

void expect(bool b, const char* message) {
    if (!b) throw std::runtime_error(message);
}

int main() {
    const auto dir = fs::temp_directory_path() / ("webwb-templates-test-" + std::to_string(::getpid()));
    fs::remove_all(dir);
    try {
        const std::string sample = R"({"name":"Свет","node":{"id":"btn_1","type":"button","name":"Кнопка","style":{"borderRadius":"5px"},"text":"Включить"}})";
        expect(webwb::validate_template(sample).valid, "valid snippet rejected");
        expect(!webwb::validate_template("{}").valid, "missing template accepted");
        expect(!webwb::validate_template(R"({"name":"Bad","node":{"id":"foo","type":"script","name":"Bad","style":{}}})").valid, "unsupported node accepted");
        std::string id;
        {
            webwb::TemplateStore store(dir);
            expect(store.list().empty(), "initial list should be empty");
            id = store.create(sample);
            expect(id.size() == 32, "generated id should be 32 chars");
            expect(store.list().size() == 1 && store.list()[0].document == sample, "template not stored");
        }
        {
            webwb::TemplateStore store(dir);
            expect(store.list().size() == 1 && store.list()[0].id == id, "restart lost data");
            store.remove(id);
            expect(store.list().empty(), "deletion failed");
            try { store.remove(id); throw std::runtime_error("missing template not rejected"); }
            catch (const webwb::StoreError& err) {
                expect(err.kind() == webwb::StoreErrorKind::not_found, "wrong delete error");
            }
            try { store.remove("../etc/passwd"); throw std::runtime_error("unsafe ID accepted"); }
            catch (const webwb::StoreError& err) {
                expect(err.kind() == webwb::StoreErrorKind::not_found, "wrong unsafe ID error");
            }
            for (int i = 0; i < 30; ++i) store.create(sample);
            expect(store.list().size() == 30, "thirty templates not accepted");
            try { store.create(sample); throw std::runtime_error("template limit not enforced"); }
            catch (const webwb::StoreError& err) {
                expect(err.kind() == webwb::StoreErrorKind::limit_reached, "wrong limit error");
            }
        }
        fs::remove_all(dir);
        std::cout << "template store tests passed\n";
    } catch (...) {
        fs::remove_all(dir);
        throw;
    }
}
