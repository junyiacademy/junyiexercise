/**
 * Event handlers for when problem history is being viewed.
 */

(function() {

$(Exercises)
        .bind("newProblem", renderReadOnlyProblem);

function renderReadOnlyProblem(event, args) {
    var framework = Exercises.getCurrentFramework();
    var userExercise = args.userExercise;
    var answerData = args.answerData;
    var answerType = args.answerType;
    var solution = args.solution;
    var hints = args.hints;
    var problem = args.problem;
    var solutionarea = $("#solutionarea");

    if (typeof userExercise !== "undefined" && userExercise.readOnly) {
        var timelineEvents, timeline;
        var timelinecontainer = $("<div id='timelinecontainer'>")
            .append("<div>\n" +
                    "<div id='previous-problem' class='simple-button'>" +
                    "上一個問題" + "</div>\n" +
                    "<div id='previous-step' class='simple-button'><span>" +
                    "上一步" + "</span></div>\n</div>")
            .insertBefore("#problem-and-answer");

        $.fn.disable = function() {
            this.addClass("disabled")
                .css({
                    cursor: "default !important"
                })
                .data("disabled", true);
            return this;
        }

        $.fn.enable = function() {
            this.removeClass("disabled")
                .css({
                    cursor: "pointer"
                })
                .data("disabled", false);
            return this;
        }

        if (!userExercise.current) {
            $(Exercises).trigger("warning", [$._("這個練習題的內容" +
                "可能已經被修改過。"), true]);
        }

        var prependHintActivity = function(thissolutionarea) {
            thissolutionarea.attr("title", $._("使用提示"));
            thissolutionarea
                .data("hint", hintNumber)
                .prepend($._("提示 #%(num)s", {num: (hintNumber + 1)}));
            hintNumber += 1;
        }

        var appendSkippedActivity = function(thissolutionarea) {
            thissolutionarea
                .removeClass("correct-activity")
                .addClass("incorrect-activity");
            thissolutionarea.attr("title", $._("跳過這題"));
            thissolutionarea.append(
                $("<p class='solution'>" + $._("跳過這題") + "</p>")
            );
        }

        var appendGuessForRadio = function(thissolutionarea, useractivity, guess) {
            thissolutionarea.append(
                $("<p class='solution'>" +
                  $._("選擇選項: " + (guess.index+1)) +
                  "</p>")
            );
            if (useractivity === "correct-activity") {
                thissolutionarea
                    .removeClass("incorrect-activity")
                    .addClass("correct-activity");
                thissolutionarea.attr("title", $._("正確答案"));
            } else {
                thissolutionarea
                    .removeClass("correct-activity")
                    .addClass("incorrect-activity");
                thissolutionarea.attr("title", $._("錯誤答案"));
            }
        }

        // Khan's custom answer type and perseus question use
        var appendGuessForCustom = function(thissolutionarea, useractivity, guess) {
            if (useractivity === "correct-activity") {
                thissolutionarea
                    .removeClass("incorrect-activity")
                    .addClass("correct-activity");
                thissolutionarea.attr("title", $._("正確答案"));
                thissolutionarea.append(
                    $("<p class='solution'>" + $._("答案正確") + "</p>")
                );
            } else {
                thissolutionarea
                    .removeClass("correct-activity")
                    .addClass("incorrect-activity");
                thissolutionarea.attr("title", $._("錯誤答案"));
                thissolutionarea.append(
                    $("<p class='solution'>" + $._("答案錯誤") + "</p>")
                );
            }
        }
        // check mutiple answer type contain custom answer type or not
        var hasCustomType = function() {
            var solAreaHasCustomType = false;
            $(solution).find(".sol").each(function(idx) {
                var type = $(this).data("type");
                if (type === "custom") {
                    solAreaHasCustomType = true;
                }
            });
            return solAreaHasCustomType;
        }
        var appendGuessHasCustomType = function(thissolutionarea, useractivity, guess) {
            var thisAnswerData = Khan.answerTypes[answerType].setup(null, solution);
            thisAnswerData.showGuess(guess);
            if (useractivity === "correct-activity") {
                thissolutionarea
                    .removeClass("incorrect-activity")
                    .addClass("correct-activity");
                thissolutionarea.attr("title", $._("正確答案"));
                thissolutionarea.append(
                    $("<p class='solution'>" + $._("答案正確") + "</p>")
                );
            } else {
                thissolutionarea
                    .removeClass("correct-activity")
                    .addClass("incorrect-activity");
                thissolutionarea.attr("title", $._("錯誤答案"));
                thissolutionarea.append(
                    $("<p class='solution'>" + $._("答案錯誤") + "</p>")
                );
            }
        }
        var appendGuess = function(thissolutionarea, useractivity, guess) {
            var thisAnswerData = Khan.answerTypes[answerType].setup(thissolutionarea, solution);
            thisAnswerData.showGuess(guess);
            if (useractivity === "correct-activity") {
                thissolutionarea
                    .removeClass("incorrect-activity")
                    .addClass("correct-activity");
                thissolutionarea.attr("title", $._("正確答案"));
            } else {
                thissolutionarea
                    .removeClass("correct-activity")
                    .addClass("incorrect-activity");
                thissolutionarea.attr("title", $._("錯誤答案"));
            }
        }

        var appendTimelineEvents = function() {
            /* value[0]: css class
             * value[1]: guess
             * value[2]: time taken since last guess
             */
            $.each(userExercise.userActivity, function(index, value) {
                // TODO(emily): figure out where this is coming from, and if we
                // can remove it. It shouldn't be i18n-ized though
                var guess = value[1] === "Activity Unavailable" ? value[1] : JSON.parse(value[1]),
                    thissolutionarea;

                timelineEvents
                    // I18N: This is a number of seconds, like '3s'
                    .append("<div class='timeline-time'>" + $._("%(time)s秒", {time: value[2]}) + "</div>");

                thissolutionarea = $("<div>")
                    .addClass("user-activity " + value[0])
                    .appendTo(timelineEvents);

                var now_activity = value[0];
                if (now_activity === "hint-activity") {
                    prependHintActivity(thissolutionarea);
                } else if (now_activity == 'skipped-activity'){
                    appendSkippedActivity(thissolutionarea);
                } else { // This panel is a solution (or the first panel)
                    thissolutionarea.data("hint", false);
                    // See above, this shouldn't be i18n-ized
                    if (guess === "Activity Unavailable") {
                        thissolutionarea.text(guess);
                    } else if (framework === "khan-exercises") {
                        // radio and custom are the only answer types that
                        // can't display its own guesses in the activity bar
                        if (answerType === "radio") {
                            appendGuessForRadio(thissolutionarea, now_activity, guess);
                        } else if (answerType === "custom") {
                            appendGuessForCustom(thissolutionarea, now_activity, guess);
                        } else if (answerType === "multiple" && hasCustomType(thissolutionarea)) {
                            // this multiple answer type contain custom answer type
                            // so use now_activity to know that user's answer correct or not
                            appendGuessHasCustomType(thissolutionarea, now_activity, guess);
                        } else {
                            appendGuess(thissolutionarea, now_activity, guess);
                        }

                        thissolutionarea
                            .data("guess", guess)
                                .find("input")
                                .attr("disabled", true)
                            .end()
                                .find("select")
                                .attr("disabled", true);
                    } else {
                        // should be perseus question.
                        Exercises.PerseusBridge.showGuess(guess);
                        var validator = function(guess) {
                            return Exercises.PerseusBridge.scoreInput();
                        }
                        appendGuessForCustom(thissolutionarea, now_activity, guess);
                        thissolutionarea
                            .data("guess", guess)
                                .find("input")
                                .attr("disabled", true)
                            .end()
                                .find("select")
                                .attr("disabled", true);
                    }
                }
            });
        }

        if (userExercise.totalDone === 0) {
            $("#previous-problem").disable();
        }

        timeline = $("<div id='timeline'>").appendTo(timelinecontainer);
        timelineEvents = $("<div id='timeline-events'>").appendTo(timeline);

        // Grab both scrubbers packaged up in one jQuery object. This is
        // wrapped in a function just because the variables held inside are
        // not used elsewhere
        var scrubber = (function() {
            var scrubberCss = {
                        display: "block",
                        width: "0",
                        height: "0",
                        "border-left": "6px solid transparent",
                        "border-right": "6px solid transparent",
                        position: "absolute"
                    },

                scrubber1 = $("<div>")
                    .css($.extend({}, scrubberCss, {
                        "border-top": "6px solid #888",
                        top: "0"
                    }))
                    .appendTo(timeline),

                scrubber2 = $("<div>")
                    .css($.extend({}, scrubberCss, {
                        "border-bottom": "6px solid #888",
                        bottom: "0"
                    }))
                    .appendTo(timeline);

            return scrubber1.add(scrubber2);
        })();

        timelinecontainer
        .append("<div>\n" +
                "<div id='next-problem' class='simple-button'>" +
                "下一個問題" + "</div>\n" +
                "<div id='next-step' class='simple-button'><span>" +
                "下一步" + "</span></div>\n</div>");

        $("<div class='user-activity correct-activity'>" + "開始" + "</div>")
            .data("hint", false)
            .appendTo(timelineEvents);

        var hintNumber = 0;



        appendTimelineEvents();

        if (timelinecontainer.height() > timeline.height()) {
            timeline.height(timelinecontainer.height());
        }

        var states = timelineEvents.children(".user-activity"),
            currentSlide = Math.min(states.length - 1, 1),
            numSlides = states.length,
            timelineMiddle = timeline.width() / 2,
            realHintsArea = $("#hintsarea"),
            realWorkArea = $("#workarea"),
            statelist = [],
            previousHintNum = 100000;

        // So highlighting doesn't fade to white
        $("#solutionarea").css("background-color", $("#answercontent").css("background-color"));

        // scroll to the slide held in state
        var scrub = function(state, fadeTime) {
            var timeline = $("#timeline"),
                slide = state.slide;

            timeline.animate({
                scrollLeft: state.scroll
            }, fadeTime);

            scrubber.animate({
                left: (timeline.scrollLeft() + slide.position().left + slide.outerWidth() / 2 + 2) + "px"
            }, fadeTime);
        };

        // Set the width of the timeline (starts as 10000px) after MathJax loads
        MathJax.Hub.Queue(function() {
            var maxHeight = 0;
            timelineEvents.children().each(function() {
                maxHeight = Math.max(maxHeight, $(this).outerHeight(true));
            });

            // This thing looks ridiculous above about 100px
            if (maxHeight > 100) {
                timelineEvents.children(".correct-activity, .incorrect-activity").each(function() {
                    $(this).text($._("Answer"));
                });
            } else if (maxHeight > timelinecontainer.height()) {
                timelinecontainer.height(maxHeight);
                timeline.height(maxHeight);
            }
        });

        var create = function(i) {
            var thisSlide = states.eq(i);

            var thisHintArea, thisProblem,
                hintNum = $("#timeline-events .user-activity:lt(" + (i + 1) + ")")
                        .filter(".hint-activity").length - 1,
                // Bring the currently focused panel as close to the middle as possible
                itemOffset = thisSlide.position().left,
                itemMiddle = itemOffset + thisSlide.width() / 2,
                offset = timelineMiddle - itemMiddle,
                currentScroll = timeline.scrollLeft(),
                timelineMax = states.eq(-1).position().left + states.eq(-1).width() + 5,
                scroll = Math.min(currentScroll - offset, currentScroll + timelineMax - timeline.width() + 25);
                if ( hintNum >= 0 && hints) {
                    $(hints[hintNum]).appendTo(realHintsArea).runModules(problem);
                }
            MathJax.Hub.Queue(function() {
                var recordState = function() {
                    $("#problemarea input").attr({disabled: "disabled"});
                    thisHintArea = realHintsArea.clone();
                    thisProblem = realWorkArea.clone();
                    var thisState = {
                        slide: thisSlide,
                        hintNum: hintNum,
                        hintArea: thisHintArea,
                        problem: thisProblem,
                        scroll: scroll,
                    };

                    statelist[i] = thisState;

                    if (i + 1 < states.length) {
                        // Create the next state
                        MathJax.Hub.Queue(function() {
                            create(i + 1);
                        });
                    } else {
                        // Scroll to the starting state
                        activate(currentSlide);
                    }
                };

                if (framework === "khan-exercises") {
                    if (thisSlide.data("guess") !== undefined && $.isFunction(answerData.showCustomGuess)) {
                        KhanUtil.currentGraph = $(realWorkArea).find(".graphie").data("graphie");
                        answerData.showCustomGuess(thisSlide.data("guess"));
                        MathJax.Hub.Queue(recordState);
                    } else {
                        recordState();
                    }
                } else {
                    recordState();
                }
            });
        };

        var activate = function(slideNum) {
            var thisState,
                thisSlide = states.eq(slideNum),
                fadeTime = 150;

            // All content for this state has been built before
            if (statelist[slideNum]) {
                thisState = statelist[slideNum];


                scrub(thisState, fadeTime);
                if (framework === "khan-exercises") {
                    $("#workarea").remove();
                    $("#hintsarea").remove();
                    $("#problemarea").append(thisState.problem).append(thisState.hintArea);
                } else {
                    Exercises.PerseusBridge.showHistoryHint(thisState.hintNum);
                }
                    // $("#problemarea").append(thisState.problem).append(thisState.hintArea);
                if (thisSlide.data("guess") !== undefined) {
                    solutionarea.effect("highlight", {}, fadeTime);

                    // If there is a guess we show it as if it was filled in by the user
                    if (framework === "khan-exercises") {
                        answerData.showGuess(thisSlide.data("guess"));
                    } else {
                        Exercises.PerseusBridge.showGuess(thisSlide.data("guess"));
                    }
                } else {
                    if (framework === "khan-exercises") {
                        answerData.showGuess();
                    } else {
                        Exercises.PerseusBridge.showGuess(thisSlide.data("guess"));
                    }
                }
                // fire the "show guess" event
                $(Khan).trigger("showGuess");
                // TODO: still highlight even if hint modifies problem (and highlight following hints)
                if (slideNum > 0 && (thisState.hintNum > statelist[slideNum - 1].hintNum)) {
                    $("#hintsarea").children().each(function(index, elem) {
                        if (index > previousHintNum) {
                            $(elem).effect("highlight", {}, fadeTime);
                        }
                    });
                    previousHintNum = thisState.hintNum;
                }

                $("#previous-step, #next-step").enable();
                if (slideNum === 0) {
                    previousHintNum = -1;
                    $("#previous-step").disable();
                } else if (slideNum === numSlides - 1) {
                    $("#next-step").disable();
                }
            }
        };

        // Some exercises use custom css
        $("#timeline input[type='text']").css("width",
            $("#answer_area input[type='text']").css("width")
        );

        MathJax.Hub.Queue(function() {create(0);});

        // Allow users to use arrow keys to move left and right in the
        // timeline
        $(document).keydown(function(event) {
            if (event.keyCode === 37) { // left
                currentSlide -= 1;
            } else if (event.keyCode === 39) { // right
                currentSlide += 1;
            } else {
                return;
            }

            currentSlide = Math.min(currentSlide, numSlides - 1);
            currentSlide = Math.max(currentSlide, 0);

            activate(currentSlide);

            return false;
        });

        // Allow users to click on points of the timeline
        $(states).click(function() {
            var index = $(this).index("#timeline .user-activity");

            currentSlide = index;
            activate(currentSlide);

            return false;
        });

        $("#previous-step").click(function() {
            if (currentSlide > 0) {
                currentSlide -= 1;
                activate(currentSlide);
            }

            return false;
        });

        $("#next-step").click(function() {
            if (currentSlide < numSlides - 1) {
                currentSlide += 1;
                activate(currentSlide);
            }

            return false;
        });

        $("#next-problem").click(function() {
            window.location.href = userExercise.nextProblemUrl;
        });

        $("#previous-problem").click(function() {
            if (!$(this).data("disabled")) {
                window.location.href = userExercise.previousProblemUrl;
            }
        });

        $("#hint").attr("disabled", true);
        $("#answercontent input").attr("disabled", true);
        $("#answercontent select").attr("disabled", true);
    }
}

})();
