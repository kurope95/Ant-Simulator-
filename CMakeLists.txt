cmake_minimum_required(VERSION 3.28)
project(AntSim VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT MSVC OR NOT CMAKE_CXX_COMPILER_ARCHITECTURE_ID STREQUAL "ARM64")
    message(FATAL_ERROR "AntSim must be built with MSVC for ARM64. Use: cmake --preset arm64")
endif()

option(ANTSIM_WARNINGS_AS_ERRORS "Treat warnings in AntSim code as errors" ON)

# Executables land in build/<Config>/ (e.g. build/Release/AntSim.exe)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

add_compile_options(/MP)

include(cmake/CompilerWarnings.cmake)
include(cmake/Dependencies.cmake)

add_subdirectory(src)

enable_testing()
add_subdirectory(tests)
