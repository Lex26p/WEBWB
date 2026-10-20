cmake_minimum_required(VERSION 3.16)

project(WEBWB VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Boost.Beast and Asio are used header-only. No Boost binary libraries are needed.
find_path(BOOST_BEAST_INCLUDE_DIR NAMES boost/beast.hpp)
if(NOT BOOST_BEAST_INCLUDE_DIR)
    message(FATAL_ERROR "Boost.Beast headers not found. Install libboost-dev in WSL.")
endif()

find_package(Threads REQUIRED)

add_executable(webwb_backend backend/src/main.cpp)
target_include_directories(webwb_backend SYSTEM PRIVATE "${BOOST_BEAST_INCLUDE_DIR}")
target_compile_definitions(webwb_backend PRIVATE BOOST_ERROR_CODE_HEADER_ONLY)
target_link_libraries(webwb_backend PRIVATE Threads::Threads)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(webwb_backend PRIVATE -Wall -Wextra -Wpedantic)
endif()

enable_testing()
add_test(NAME backend_help COMMAND webwb_backend --help)
add_test(NAME backend_rejects_invalid_port COMMAND webwb_backend --port 0)
set_tests_properties(backend_rejects_invalid_port PROPERTIES WILL_FAIL TRUE)
