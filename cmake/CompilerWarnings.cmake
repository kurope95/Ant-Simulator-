function(antsim_target_defaults target)
    target_compile_options(${target} PRIVATE
        /W4 /permissive- /utf-8 /Zc:__cplusplus
        /external:anglebrackets /external:W0
        $<$<BOOL:${ANTSIM_WARNINGS_AS_ERRORS}>:/WX>)
endfunction()
