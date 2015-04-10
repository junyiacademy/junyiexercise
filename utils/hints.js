﻿$(Khan).bind("checkAnswer", function() {

    if (!$(".hint-box").data("free")) {

        $(".hint-box")
            .data("free", true)
            .css("position", "relative")
            .animate({top: -10}, 250)
            .find(".info-box-header")
                .slideUp(250)
                .end()
            .find("#hint")
                .switchClass("orange", "green", 1 /* duration */, function() {
                    $(this)
                        .data("buttonText", Khan.showSolutionButtonText)
                        .val(Khan.showSolutionButtonText);
                });

    }

});

$(Khan).bind("newProblem", function() {

    // Restore the hint button
    $("#hint")
        .removeClass("green")
        .addClass("orange")
        .val("我需要提示")
        .data("buttonText", false)
        .stop(true /* clear */, true /* jump */)
        .appendTo("#get-hint-button-container");

    $(".hint-box")
        .data("free", false)
        .css("top", "0")
        .find(".info-box-header")
            .show();

    var examples = $("#examples");
    if (examples.length && $.prototype.qtip != null) {
        if($('#solutionarea input[type=text]:not([readonly])').length >= 1) {
            $('#solutionarea input[type=text]:not([readonly])').each(function() {
                $( this ).qtip({
                content: {
                    text: examples.clone().runModules(),
                    prerender: true
                },
                style: {
                    classes: "ui-tooltip-light leaf-tooltip"
                },
                position: {
                    my: "bottom left",
                    at: "top right"
                },
                show: 'focus',
                hide: 'blur'
                });
            });

            
        }
        else {
            $('#solutionarea').prepend('<div class="instruction">'+examples.text()+'</div>');

            // Tooltip-ify the example answer formats
            /*
            $("#examples-show").qtip({
                content: {
                    text: examples.remove(),
                    prerender: true
                },
                style: {
                    classes: "ui-tooltip-light leaf-tooltip"
                },
                position: {
                    my: "bottom center",
                    at: "top center"
                },
                show: {
                    delay: 200,
                    effect: {
                        length: 0
                    }
                },
                hide: {
                    delay: 0
                }
            });
            */
        }

    }

});
