add_library(antsim_core STATIC
    core/build_info.cpp)
target_include_directories(antsim_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_definitions(antsim_core PRIVATE ANTSIM_VERSION="${PROJECT_VERSION}")
antsim_target_defaults(antsim_core)
