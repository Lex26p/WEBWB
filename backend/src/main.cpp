#include <boost/asio.hpp>
#include <boost/beast.hpp>
#include <json-c/json.h>

#include "webwb/project_store.hpp"
#include "webwb/project_validation.hpp"
#include "webwb/template_store.hpp"

#include <chrono>
#include <cstddef>
#include <exception>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace http = beast::http;
using tcp = asio::ip::tcp;

namespace {

struct Configuration {
    unsigned short port = 8088;
    std::string data_directory = "/mnt/data/webwb";
};

using JsonObject = std::unique_ptr<json_object, decltype(&json_object_put)>;

void print_usage(const char* executable) {
    std::cout << "WEBWB backend\n"
              << "Usage: " << executable << " [--port 8088] [--data-dir PATH]\n"
              << "       " << executable << " --help\n"
              << "Server listens on 127.0.0.1 only.\n"
              << "GET /api/health\n"
              << "POST /api/projects/validate\n"
              << "GET/POST /api/projects and GET/PUT/DELETE /api/projects/<id>\n"
              << "GET/POST /api/templates and DELETE /api/templates/<id>\n";
}

unsigned short parse_port(const std::string& text) {
    if (text.empty() || text.find_first_not_of("0123456789") != std::string::npos) {
        throw std::invalid_argument("port must be a number from 1 to 65535");
    }
    const auto value = std::stoul(text);
    if (value == 0 || value > 65535) {
        throw std::invalid_argument("port must be a number from 1 to 65535");
    }
    return static_cast<unsigned short>(value);
}

Configuration read_arguments(int argc, char* argv[]) {
    Configuration config;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--port" && i + 1 < argc) {
            config.port = parse_port(argv[++i]);
        } else if (arg == "--data-dir" && i + 1 < argc) {
            config.data_directory = argv[++i];
            if (config.data_directory.empty()) {
                throw std::invalid_argument("--data-dir must not be empty");
            }
        } else {
            throw std::invalid_argument("unknown or incomplete argument: " + arg);
        }
    }
    return config;
}

std::string json_string(json_object* object) {
    return json_object_to_json_string_ext(object, JSON_C_TO_STRING_PLAIN);
}

std::string error_json(const char* code, const std::string& message = {}) {
    JsonObject output(json_object_new_object(), json_object_put);
    json_object_object_add(output.get(), "error", json_object_new_string(code));
    if (!message.empty()) {
        json_object_object_add(output.get(), "detail", json_object_new_string(message.c_str()));
    }
    return json_string(output.get());
}

http::response<http::string_body> make_response(const http::request<http::string_body>& request,
                                                webwb::ProjectStore& store,
                                                webwb::TemplateStore& templates) {
    http::response<http::string_body> response;
    response.version(request.version());
    response.keep_alive(false);
    response.set(http::field::server, "WEBWB");
    response.set(http::field::cache_control, "no-store");
    response.set(http::field::content_type, "application/json; charset=utf-8");

    const std::string target(request.target());
    const auto method = request.method();
    if (target == "/api/health") {
        if (method == http::verb::get) {
            response.result(http::status::ok);
            response.body() = R"({"status":"ok","service":"webwb"})";
        } else {
            response.result(http::status::method_not_allowed);
            response.set(http::field::allow, "GET");
            response.body() = error_json("method_not_allowed");
        }
    } else if (target == "/api/projects/validate") {
        if (method == http::verb::post) {
            const auto validation = webwb::validate_project(request.body());
            response.result(validation.valid ? http::status::ok : http::status::bad_request);
            if (validation.valid) {
                response.body() = R"({"valid":true,"version":3})";
            } else {
                JsonObject output(json_object_new_object(), json_object_put);
                json_object_object_add(output.get(), "valid", json_object_new_boolean(false));
                json_object_object_add(output.get(), "error", json_object_new_string("invalid_project"));
                json_object_object_add(output.get(), "detail", json_object_new_string(validation.message.c_str()));
                response.body() = json_string(output.get());
            }
        } else {
            response.result(http::status::method_not_allowed);
            response.set(http::field::allow, "POST");
            response.body() = error_json("method_not_allowed");
        }
    } else if (target == "/api/templates" ||
               (target.rfind("/api/templates/", 0) == 0 &&
                webwb::ProjectStore::valid_project_id(target.substr(15)))) {
        const bool collection = target == "/api/templates";
        const std::string id = collection ? "" : target.substr(15);
        try {
            if (collection && method == http::verb::get) {
                JsonObject output(json_object_new_object(), json_object_put);
                json_object* items = json_object_new_array();
                for (const auto& item : templates.list()) {
                    JsonObject obj(json_tokener_parse(item.document.c_str()), json_object_put);
                    json_object_object_add(obj.get(), "id", json_object_new_string(item.id.c_str()));
                    json_object_array_add(items, json_object_get(obj.get()));
                }
                json_object_object_add(output.get(), "templates", items);
                response.result(http::status::ok);
                response.body() = json_string(output.get());
            } else if (collection && method == http::verb::post) {
                const auto validation = webwb::validate_template(request.body());
                if (!validation.valid) {
                    response.result(http::status::bad_request);
                    response.body() = error_json("invalid_template", validation.message);
                } else {
                    const auto new_id = templates.create(request.body());
                    response.result(http::status::created);
                    response.set(http::field::location, "/api/templates/" + new_id);
                    JsonObject output(json_object_new_object(), json_object_put);
                    json_object_object_add(output.get(), "id", json_object_new_string(new_id.c_str()));
                    response.body() = json_string(output.get());
                }
            } else if (!collection && method == http::verb::delete_) {
                templates.remove(id);
                response.result(http::status::no_content);
                response.body().clear();
            } else {
                response.result(http::status::method_not_allowed);
                response.set(http::field::allow, collection ? "GET, POST" : "DELETE");
                response.body() = error_json("method_not_allowed");
            }
        } catch (const webwb::StoreError& error) {
            const bool missing = error.kind() == webwb::StoreErrorKind::not_found;
            const bool full = error.kind() == webwb::StoreErrorKind::limit_reached;
            response.result(missing ? http::status::not_found : full ? http::status::conflict : http::status::internal_server_error);
            response.body() = missing ? error_json("not_found") : full ? error_json("template_limit") : error_json("storage_error");
            if (!missing && !full) std::cerr << "Template storage error: " << error.what() << '\n';
        }
    } else if (target == "/api/projects" ||
               (target.rfind("/api/projects/", 0) == 0 &&
                webwb::ProjectStore::valid_project_id(target.substr(14)))) {
        const bool collection = (target == "/api/projects");
        const std::string id = collection ? "" : target.substr(14);
        try {
            if (collection && method == http::verb::get) {
                JsonObject output(json_object_new_object(), json_object_put);
                json_object* items = json_object_new_array();
                for (const auto& entry : store.list()) {
                    json_object* item = json_object_new_object();
                    json_object_object_add(item, "id", json_object_new_string(entry.id.c_str()));
                    json_object_object_add(item, "title", json_object_new_string(entry.title.c_str()));
                    json_object_array_add(items, item);
                }
                json_object_object_add(output.get(), "projects", items);
                response.result(http::status::ok);
                response.body() = json_string(output.get());
            } else if (collection && method == http::verb::post) {
                const auto validation = webwb::validate_project(request.body());
                if (!validation.valid) {
                    response.result(http::status::bad_request);
                    response.body() = error_json("invalid_project", validation.message);
                } else {
                    const auto new_id = store.create(request.body());
                    response.result(http::status::created);
                    response.set(http::field::location, "/api/projects/" + new_id);
                    JsonObject output(json_object_new_object(), json_object_put);
                    json_object_object_add(output.get(), "id", json_object_new_string(new_id.c_str()));
                    response.body() = json_string(output.get());
                }
            } else if (!collection && method == http::verb::get) {
                response.result(http::status::ok);
                response.body() = store.read(id);
            } else if (!collection && method == http::verb::put) {
                const auto validation = webwb::validate_project(request.body());
                if (!validation.valid) {
                    response.result(http::status::bad_request);
                    response.body() = error_json("invalid_project", validation.message);
                } else {
                    store.update(id, request.body());
                    response.result(http::status::ok);
                    response.body() = R"({"updated":true})";
                }
            } else if (!collection && method == http::verb::delete_) {
                store.remove(id);
                response.result(http::status::no_content);
                response.body().clear();
            } else {
                response.result(http::status::method_not_allowed);
                response.set(http::field::allow, collection ? "GET, POST" : "GET, PUT, DELETE");
                response.body() = error_json("method_not_allowed");
            }
        } catch (const webwb::StoreError& error) {
            const bool missing = error.kind() == webwb::StoreErrorKind::not_found;
            response.result(missing ? http::status::not_found : http::status::internal_server_error);
            response.body() = missing ? error_json("not_found") : error_json("storage_error");
            if (!missing) std::cerr << "Project storage error: " << error.what() << '\n';
        }
    } else {
        response.result(http::status::not_found);
        response.body() = error_json("not_found");
    }

    response.prepare_payload();
    return response;
}

void serve_connection(tcp::socket socket, webwb::ProjectStore& store,
                      webwb::TemplateStore& templates) {
    beast::tcp_stream stream(std::move(socket));
    stream.expires_after(std::chrono::seconds(5));
    beast::flat_buffer buffer;
    http::request_parser<http::string_body> parser;
    parser.header_limit(16 * 1024);
    parser.body_limit(webwb::kMaxProjectBytes);

    beast::error_code error;
    http::read(stream, buffer, parser, error);
    if (!error) {
        const auto request = parser.release();
        const auto response = make_response(request, store, templates);
        http::write(stream, response, error);
    }
    if (error && error != http::error::end_of_stream) {
        std::cerr << "HTTP connection error: " << error.message() << '\n';
    }
    beast::error_code ignored;
    stream.socket().shutdown(tcp::socket::shutdown_both, ignored);
}

int run(const Configuration& config) {
    webwb::ProjectStore store(config.data_directory);
    webwb::TemplateStore templates(config.data_directory);
    asio::io_context io_context{1};
    tcp::acceptor listener(io_context);
    listener.open(tcp::v4());
    listener.set_option(asio::socket_base::reuse_address(true));
    listener.bind(tcp::endpoint(asio::ip::make_address_v4("127.0.0.1"), config.port));
    listener.listen(asio::socket_base::max_listen_connections);

    std::cout << "WEBWB backend listening at http://127.0.0.1:" << config.port << '\n'
              << "Projects directory: " << config.data_directory << "/projects\n"
              << "Templates directory: " << config.data_directory << "/templates\n"
              << "Stop with Ctrl+C.\n" << std::flush;

    for (;;) {
        tcp::socket socket(io_context);
        beast::error_code error;
        listener.accept(socket, error);
        if (error) {
            std::cerr << "Accept error: " << error.message() << '\n';
            continue;
        }
        try {
            serve_connection(std::move(socket), store, templates);
        } catch (const std::exception& ex) {
            std::cerr << "HTTP request error: " << ex.what() << '\n';
        }
    }
}

} // namespace

int main(int argc, char* argv[]) {
    try {
        if (argc == 2 && std::string(argv[1]) == "--help") {
            print_usage(argv[0]);
            return 0;
        }
        return run(read_arguments(argc, argv));
    } catch (const std::exception& error) {
        std::cerr << "WEBWB backend: " << error.what() << '\n';
        return 1;
    }
}
