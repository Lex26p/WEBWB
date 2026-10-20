#include "webwb/project_store.hpp"

#include <json-c/json.h>

#include <stdexcept>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <unistd.h>

namespace fs = std::filesystem;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

std::string fixture() {
    std::ifstream file(WEBWB_SAMPLE_PROJECT);
    if (!file) throw std::runtime_error("cannot open fixture");
    return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}

int main() {
    const fs::path root = fs::temp_directory_path() /
        ("webwb-store-test-" + std::to_string(::getpid()));
    fs::remove_all(root);
    try {
        const auto original = fixture();
        std::string id;
        {
            webwb::ProjectStore store(root);
            require(store.list().empty(), "storage check failed");
            id = store.create(original);
            require(webwb::ProjectStore::valid_project_id(id), "storage check failed");
            require(store.read(id) == original, "storage check failed");
            const auto projects = store.list();
            require(projects.size() == 1, "storage check failed");
            require(projects[0].id == id, "storage check failed");
            require(projects[0].title == "Моя панель", "storage check failed");
            // Creating another project never overwrites the first.
            require(store.create(original) != id, "storage check failed");
        }
        {
            webwb::ProjectStore store(root);
            require(store.list().size() == 2, "storage check failed"); // persisted across instances
            std::string updated = original;
            const auto title = updated.find("Моя панель");
            require(title != std::string::npos, "storage check failed");
            updated.replace(title, std::string("Моя панель").size(), "Панель 2");
            store.update(id, updated);
            require(store.read(id) == updated, "storage check failed");
            require(store.list()[0].title == "Панель 2" || store.list()[1].title == "Панель 2", "storage check failed");
            store.remove(id);
            try { store.read(id); require(false && "deleted project must not exist", "storage check failed"); }
            catch (const webwb::StoreError& error) { require(error.kind() == webwb::StoreErrorKind::not_found, "storage check failed"); }
            require(store.list().size() == 1, "storage check failed");
            try { store.read("../etc/passwd"); require(false && "invalid id must be rejected", "storage check failed"); }
            catch (const webwb::StoreError& error) { require(error.kind() == webwb::StoreErrorKind::not_found, "storage check failed"); }
        }
        fs::remove_all(root);
        std::cout << "project store tests passed\n";
    } catch (...) {
        fs::remove_all(root);
        throw;
    }
}
