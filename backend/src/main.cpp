#include <boost/asio.hpp>
#include <boost/beast.hpp>

#include <chrono>
#include <cstddef>
#include <exception>
#include <iostream>
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
    // Path is only stored at this stage. Disk writes arrive in later steps.
    std::string data_directory = "/mnt/data/webwb";
};

void print_usage(const char* executable) {
    std::cout << "WEBWB backend (HTTP skeleton)\n"
              << "Usage: " << executable << " [--port 8088] [--data-dir PATH]\n"
              << "       " << executable << " --help\n"
              << "Server listens on 127.0.0.1 only.\n"
              << "GET /api/health returns JSON.\n";
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

http::response<http::string_body> make_response(const http::request<http::string_body>& request) {
    http::response<http::string_body> response;
    response.version(request.version());
    response.keep_alive(false);
    response.set(http::field::server, "WEBWB");
    response.set(http::field::cache_control, "no-store");
    response.set(http::field::content_type, "application/json; charset=utf-8");

    if (request.target() == "/api/health" && request.method() == http::verb::get) {
        response.result(http::status::ok);
        response.body() = R"({"status":"ok","service":"webwb"})";
    } else if (request.target() == "/api/health") {
        response.result(http::status::method_not_allowed);
        response.set(http::field::allow, "GET");
        response.body() = R"({"error":"method_not_allowed"})";
    } else {
        response.result(http::status::not_found);
        response.body() = R"({"error":"not_found"})";
    }

    response.prepare_payload();
    return response;
}

void serve_connection(tcp::socket socket) {
    beast::tcp_stream stream(std::move(socket));
    stream.expires_after(std::chrono::seconds(5));

    beast::flat_buffer buffer;
    http::request_parser<http::string_body> parser;
    parser.header_limit(16 * 1024);
    parser.body_limit(1024 * 1024);

    beast::error_code error;
    http::read(stream, buffer, parser, error);
    if (!error) {
        const auto request = parser.release();
        auto response = make_response(request);
        http::write(stream, response, error);
    }
    if (error && error != http::error::end_of_stream) {
        std::cerr << "HTTP connection error: " << error.message() << '\n';
    }

    beast::error_code ignored;
    stream.socket().shutdown(tcp::socket::shutdown_both, ignored);
}

int run(const Configuration& config) {
    asio::io_context io_context{1};
    tcp::acceptor listener(io_context);

    listener.open(tcp::v4());
    listener.set_option(asio::socket_base::reuse_address(true));
    listener.bind(tcp::endpoint(asio::ip::make_address_v4("127.0.0.1"), config.port));
    listener.listen(asio::socket_base::max_listen_connections);

    std::cout << "WEBWB backend listening at http://127.0.0.1:" << config.port << '\n'
              << "Data directory (not used yet): " << config.data_directory << '\n'
              << "Stop with Ctrl+C.\n" << std::flush;

    // Deliberately simple synchronous loop for the first API endpoint.
    // The persistence API will introduce concurrent request handling if needed.
    for (;;) {
        tcp::socket socket(io_context);
        beast::error_code error;
        listener.accept(socket, error);
        if (error) {
            std::cerr << "Accept error: " << error.message() << '\n';
            continue;
        }
        serve_connection(std::move(socket));
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
