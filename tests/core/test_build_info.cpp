#include <doctest/doctest.h>

#include <string>

#include "core/build_info.hpp"

TEST_CASE("build_info: names the version, compiler, ARM64 and C++20") {
    const std::string info{antsim::core::build_info()};
    CHECK(info.find("AntSim 0.1.0") != std::string::npos);
    CHECK(info.find("MSVC") != std::string::npos);
    CHECK(info.find("ARM64") != std::string::npos);
    CHECK(info.find("C++20") != std::string::npos);
}
