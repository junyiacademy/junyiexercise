/**
 * Interface glue to handle events from 'Exercises' and talk to 'Khan' or some
 * Perseus object, whichever is appropriate for the current exercise.
 *
 * In general, khan-exercises and perseus will want to trigger events on
 * Exercises but only listen to their own events.
 */
(function() {

// If any of these properties have already been defined, then leave them --
// this happens in local mode
_.defaults(Exercises, {
    khanExercisesUrlBase: "/khan-exercises/",

    getCurrentFramework: function(userExerciseOverride) {
        if (PerseusBridge.localMode) {
            return "perseus";
        }
        else {
            // Currently we render perseus question by the same way with html exercises.
            return (userExerciseOverride || userExercise).exerciseModel.isQuizExercise ?
                "perseus" : "khan-exercises";
        }
    }
});

_.extend(Exercises, {
    guessLog: undefined,
    userActivityLog: undefined
});
var hintCanVibration = true; 
var waitForVibration = false;
var firstTimeWrong = true;
var PerseusBridge = Exercises.PerseusBridge,

    // Store these here so that they're hard to change after the fact via
    // bookmarklet, etc.
    localMode = Exercises.localMode,
    previewingItem,

    originalCheckAnswerText,

    userExercise,
    problemNum,

    canAttempt,
    hintsAreFree,
    attempts,
    numHints,
    hintsUsed,
    lastAttemptOrHint,
    firstProblem = true;

$(Exercises)
    .bind("problemTemplateRendered", problemTemplateRendered)
    .bind("newProblem", newProblem)
    .bind("hintShown", onHintShown)
    .bind("readyForNextProblem", readyForNextProblem)
    .bind("warning", warning)
    .bind("upcomingExercise", upcomingExercise)
    .bind("gotoNextProblem", gotoNextProblem)
    .bind("updateUserExercise", updateUserExercise)
    .bind("clearExistingProblem", clearExistingProblem);

function exercisePointCalculator(){
    // Warning!!!!!!!!!!!
    // If you want to modify exercisePointCalculator, you have to modify
    // 'ExercisePointCalculator()' in points.py too.

    var min_streak_till_proficiency = 4;
    var degrade_threshold = 19;
    var incomplete_exercise_points_base = 15;
    var exercise_points_base = 5;
    var topic_exercise_multiplier = 3;
    var suggested_exercise_multiplier = 3;
    var incomplete_exercise_multiplier = 5;
    var limit_exercises = 150;
    
    var points = 0;
    var offset = 0;
    var required_streak = min_streak_till_proficiency;
    //degrade_threshold = (required_streak + consts.DEGRADING_EXERCISES_AFTER_PROFICIENCY)

    var proficient = userExercise.exerciseStates['proficient'];
    var suggested = userExercise.exerciseStates['suggested'];
    if (userExercise.longestStreak + offset <= required_streak) {
        points = incomplete_exercise_points_base;
    } else if (userExercise.longestStreak + offset < degrade_threshold) {
        points = degrade_threshold - userExercise.longestStreak - offset;
    }

    if (points < exercise_points_base) {
        points = exercise_points_base;
    }

    if (!Exercises.reviewMode && !Exercises.practiceMode && !Exercises.pretestMode) {
        // topic_mode
        points = points * topic_exercise_multiplier;
    } else if (suggested) {
        points = points * suggested_exercise_multiplier;
    }

    if (! proficient) {
        points = points * incomplete_exercise_multiplier;
    }

    if (userExercise.totalDone >= limit_exercises){
        points = exercise_points_base;
    }

    return Math.ceil(points);

}

function problemTemplateRendered() {
    previewingItem = Exercises.previewingItem;
    var first_time_skip = true;
    // Setup appropriate img URLs
    $("#issue-throbber").attr("src",
            Exercises.khanExercisesUrlBase + "css/images/throbber.gif");

    $("#positive-reinforcement").hide();
    if (localMode) {
        // The /khan-exercises/images/ folder isn't available in GAE prod so
        // don't change the src there, even though it would kind of work.
        $("#positive-reinforcement > img").attr("src",
                Exercises.khanExercisesUrlBase + "images/face-smiley.png");
    }

    // 'Check Answer' or 'Submit Answer'
    originalCheckAnswerText = $("#check-answer-button").val();

    // Solution submission
    $("#check-answer-button").click(handleCheckAnswer);
    $("#answerform").submit(handleCheckAnswer);
    $("#questionform").submit(handleCheckAnswer);
    $("#skip-question-button").click(function(e) {
        if(first_time_skip){
        swal({
            title:'<span style="font-size:20px;">小提醒：按下之後將無法再做答這題\n您確定要跳過嗎？</span>',
            imageUrl: '/images/warn.svg',
            imageWidth: 80,
            width: 420,
            showCancelButton: true,
            confirmButtonText: '是',
            confirmButtonColor: '#ff6756',
            cancelButtonText: '否',
        }).then(function () {
            first_time_skip = false;
            handleSkippedQuestion();
        })
        }else{
            handleSkippedQuestion();
        }
        return false;
    });

    $("#watch-report-directly").click(function(e) {
        swal({
            title:'<span style="font-size:16px;">小提醒：按下之後將中止這份評量，如評量為老師指派的任務，將無法重新進行。\n您確定要中止嗎？</span>',
            imageUrl: '/images/warn.svg',
            imageWidth: 80,
            width: 420,
            showCancelButton: true,
            confirmButtonText: '是',
            confirmButtonColor: '#ff6756',
            cancelButtonText: '否',
        }).then(function () {
            handleJumpToEnd();
        })
        return false;
    });    
    // Hint button
    $("#hint").click(onHintButtonClicked);

    // Next question button
    $("#next-question-button").click(function() {
        $(Exercises).trigger("gotoNextProblem");        

        $("#raise-hand-button").prop('disabled', false);

        // Disable next question button until next time
        // TODO(alpert): Why? Is blurring not enough?
        $(this)
            .attr("disabled", true)
            .addClass("buttonDisabled");
    });

    // If happy face is clicked, pass click on through.
    $("#positive-reinforcement").click(function() {
        $("#next-question-button").click();
    });

    // Let users close the warning bar when appropriate
    $("#warning-bar-close a").click(function(e) {
        e.preventDefault();
        $("#warning-bar").fadeOut("slow");
    });

    // Scratchpad toggle
    $("#scratchpad-show").click(function(e) {
        e.preventDefault();
        Khan.scratchpad.toggle();

        if (!localMode && userExercise.user) {
            window.localStorage["scratchpad:" + userExercise.user] =
                    Khan.scratchpad.isVisible();
        }
    });

    // trigger outside issue report system
    $("#issue-report-button").click(function(e) {
        e.preventDefault();
        $("#report").click();
    });

    if(Exercises.notifyNextReview === true){
        $("span.practice-exercise-topic-context.solid-hover").css("opacity", 100);
        $("#notify_next_review").tooltip("show");
        setTimeout('$("#notify_next_review").tooltip("hide")', 5000);
    }

    // These shouldn't interfere...
    $(PerseusBridge).trigger("problemTemplateRendered");
    $(Khan).trigger("problemTemplateRendered");
}

function newProblem(e, data) {
    Exercises.guessLog = [];
    Exercises.userActivityLog = [];

    canAttempt = true,
    hintsAreFree = false,
    attempts = data.userExercise && data.userExercise.lastAttemptNumber ? data.userExercise.lastAttemptNumber : 0;
    numHints = data.numHints;
    hintsUsed = data.userExercise && data.userExercise.lastCountHints? data.userExercise.lastCountHints : 0;
    lastAttemptOrHint = new Date().getTime();

    var framework = Exercises.getCurrentFramework();
    $("#problem-and-answer")
            .removeClass("framework-khan-exercises")
            .removeClass("framework-perseus")
            .addClass("framework-" + framework);

    // Enable/disable the get hint button
    if (numHints === 0) {
        $("#get-hint-button-container").css("display","none");
    }
    else {
        $("#get-hint-button-container").css("display","unset");
    }
    updateHintButtonText();
    $("#hint").attr("disabled", hintsUsed >= numHints);

    // add GA_code to scratchpad svg when newproblem render
    $("#scratchpad svg").attr("onclick","Analytics.send_ga_event('exercise', 'click', 'scratchpad_used');");
    $("#scratchpad").on('click', 'svg', function(e) {
        e.preventDefault();
        $("#scratchpad svg").attr("onclick","");
    });
}

function handleCheckAnswer() {
    return handleAttempt({skipped: false});
}

function handleSkippedQuestion() {
    handleStopExam(1);
    //return handleAttempt({skipped: true});
}

function handleAttempt(data) {
    var framework = Exercises.getCurrentFramework();
    var skipped = data.skipped;
    var score;

    if (framework === "perseus") {
        score = PerseusBridge.scoreInput();
    } else if (framework === "khan-exercises") {
        score = Khan.scoreInput();
    }

    // Stop if the user didn't try to skip the question and also didn't yet
    // enter a response
    if (score.empty && !skipped) {
        if (score.message) {
            $("#check-answer-results > p").html(score.message).tmpl().show();
        }
        return false;
    }

    if (!canAttempt) {
        // Just don't allow further submissions once a correct answer or skip
        // has been called or sometimes the server gets confused.
        return false;
    }

    if (score.correct || skipped) {
        // Once we receive a correct answer or a skip, that's it; further
        // attempts are disallowed.
        canAttempt = false;
    }

    // For pretest mode, update user's answer history.
    if (Exercises.pretestMode) {
        $(Exercises).trigger("updateAnswerHistory", {
            name: Exercises.currentCard.get('exerciseName'),
            pass: score.correct,
            skip: skipped
        });
    }

    Exercises.guessLog.push(score.guess);
    Exercises.userActivityLog.push([
            score.correct ? "correct-activity" : "incorrect-activity",
            stringifiedGuess, timeTaken]);

    if (score.correct || skipped || Exercises.examMode) {
        $(Exercises).trigger("problemDone", {
            card: Exercises.currentCard,
            attempts: attempts
        });
    }

    // Update interface corresponding to correctness,
    // in examMode, we don't give feedback if it is correct or wrong
    if (skipped || Exercises.assessmentMode || Exercises.examMode) {
        disableCheckAnswer();
        $("#check-answer-results > p").hide();
    } else if (score.correct) {
        // Correct answer, so show the next question button.
        firstTimeWrong = true;
        if ((document.getElementById("au-correct-answer") !== null)) {
            document.getElementById("au-correct-answer").play();
        }
        $("#check-answer-button").hide();
        $("#check-answer-results > p").hide();
        $("#next-question-button")
            .prop("disabled", false)
            .removeClass("buttonDisabled")
            .show();
        if ( !localMode && hintsUsed == 0  && attempts == 0){
            var points = exercisePointCalculator();
            $('#answercontent .energy-points-badge')
            .html('+' +points.toString())
            .attr('class', 'positive-trigger energy-points-badge')
            .attr('style', 'color:white;background-color:#005987;border-radius:3px;padding:3px;')
            .effect('bounce', {}, 1000, function(){
                $(this).hide();
            });
        }

        if(!/iphone|ipod|ipad/i.test(navigator.userAgent)) // check if is ipad device
        {
            $("#next-question-button").focus();
        }
        $("#positive-reinforcement").show();
        $("#skip-question-button").prop("disabled", true);
    } else {
        // Wrong answer. Enable all the input elements

        if (waitForVibration == false || firstTimeWrong == true) {
            firstTimeWrong = false;
            waitForVibration = true;
            $("#check-answer-button")
                .val($._("答錯了，再試試看喔！"))
                .parent()  // .check-answer-wrapper makes shake behave
                .effect("shake", {times: 3, distance: 5}, 480);
                setTimeout(function() {
                    waitForVibration = false;
                    hintCanVibration = true;
                },1500);               
        } 

        // Is this a message to be shown?
        if (score.message != null) {
            $("#check-answer-results > p").html(score.message).tmpl().show();
        } else {
            $("#check-answer-results > p").hide();
        }

        if (framework === "perseus") {
            // TODO(alpert)?
        } else if (framework === "khan-exercises") {
            $(Khan).trigger("refocusSolutionInput");
        }
    }

    if (!hintsAreFree) {
        hintsAreFree = true;
        $(".hint-box")
            .css("position", "relative")
            .animate({top: -10}, 250)
            .find(".info-box-header")
                .slideUp(250)
                .end()
            .find("#hint")
                .removeClass("orange")
                .addClass("green");
        updateHintButtonText();
    }
    if(skipped){
         $(Exercises).trigger("skipAnswer", {
        correct: null,
        card: Exercises.currentCard,

        // Determine if this attempt qualifies as fast completion
        fast: !localMode && userExercise.secondsPerFastProblem >= timeTaken
    });      
    }
    else{
        $(Exercises).trigger("checkAnswer", {
            correct: score.correct,
            card: Exercises.currentCard,

            // Determine if this attempt qualifies as fast completion
            fast: !localMode && userExercise.secondsPerFastProblem >= timeTaken
        });
    }

    var curTime = new Date().getTime();
    var timeTaken = Math.round((curTime - lastAttemptOrHint) / 1000);
    var stringifiedGuess = JSON.stringify(score.guess);
    var attemptData = null;
    if (!localMode) {
        if(skipped){
            attemptData = buildAttemptData(
                null, ++attempts, stringifiedGuess, timeTaken, skipped);
        }else
        {
            attemptData = buildAttemptData(
                score.correct, ++attempts, stringifiedGuess, timeTaken, skipped);
        }
    }
    lastAttemptOrHint = curTime;

    if (localMode || Exercises.currentCard.get("preview")) {
        // Skip the server; just pretend we have success
        return false;
    }

    if (previewingItem) {
        $("#next-question-button").prop("disabled", true);

        // Skip the server; just pretend we have success
        return false;
    }
    var requestUrl = "problems/" + problemNum + "/attempt";
    return_problemNum = problemNum;
    if ((skipped || Exercises.examMode) && !Exercises.assessmentMode ) {
        // Skipping or examMode should pull up the next card immediately - but, if we're in
        // assessment mode, we don't know what the next card will be yet, so
        // wait for the special assessment mode triggers to fire instead.
        if(skipped){
            $(Exercises).trigger("jumptoNextProblem");
        }else{
            $(Exercises).trigger("gotoNextProblem");
        }
    }
    // Save the problem results to the server
    if(!skipped){
        request(requestUrl, attemptData).fail(function(xhr) {
            // Alert any listeners of the error before reload
            $(Exercises).trigger("attemptError", {userExercise: userExercise});

            if (xhr && xhr.readyState === 0) {
                // This path gets called when there is a broken pipe during
                // page unload- browser navigating away during ajax request
                // See http://stackoverflow.com/a/1370383.
                return;
            }

            // Error during submit. Disable the page and ask users to
            // reload in an attempt to get updated data.

            // Hide the page so users don't continue, then warn the user about the
            // problem and encourage reloading the page
            $("#problem-and-answer").css("visibility", "hidden");
            $(Exercises).trigger("warning",
                    $._("這一個畫面過期了。請<a href='" + window.location.href +
                        "'>重新整理</a>網頁。"
                        )
            );
        });
        return false;
    }
    return [return_problemNum,attemptData];
}

function onHintButtonClicked() {
    var framework = Exercises.getCurrentFramework();

    if (framework === "perseus") {
        $(PerseusBridge).trigger("showHint");
    } else if (framework === "khan-exercises") {
        $(Khan).trigger("showHint");
    }
}

function handleJumpToEnd(data){
    handleStopExam(Exercises.incompleteStack.length);
}

function handleStopExam(cards_to_be_skipped) {
    var attemptDataList = [];
    var problemNumList = [];
    for (var i = 0; i < cards_to_be_skipped ; i++){
        attemptData = handleAttempt({skipped: true});
        attemptDataList.push(attemptData[1]);
        problemNumList.push(attemptData[0]);
    }

    var requestUrl = "skip_problems/attempt";
    request(requestUrl, {
        "list": JSON.stringify(attemptDataList), 
        casing : "camel", 
        "problem_list": JSON.stringify(problemNumList)
    }).fail(function(xhr) {
        // Alert any listeners of the error before reload
        $(Exercises).trigger("attemptError", {userExercise: userExercise});

        if (xhr && xhr.readyState === 0) {
            // This path gets called when there is a broken pipe during
            // page unload- browser navigating away during ajax request
            // See http://stackoverflow.com/a/1370383.
            return;
        }

        // Error during submit. Disable the page and ask users to
        // reload in an attempt to get updated data.

        // Hide the page so users don't continue, then warn the user about the
        // problem and encourage reloading the page
        $("#problem-and-answer").css("visibility", "hidden");
        $(Exercises).trigger("warning",
                $._("這一個畫面過期了。請<a href='" + window.location.href +
                    "'>重新整理</a>網頁。"
                    )
        );
    });
}

/**
 * Handle the event when a user clicks to use a hint.
 *
 * This deals with the internal work to do things like sending the event up
 * to the server, as well as triggering the external event "hintUsed" so that
 * other parts of the UI may update first. It's separated into two events so
 * that the XHR can be sent after the other items have a chance to respond.
 */
function onHintShown(e, data) {
    // Grow the scratchpad to cover the new hint
    Khan.scratchpad.resize();

    hintsUsed++;
    updateHintButtonText();

    // if user click hint, pass this question as false to updateAnswerHistory
    if (Exercises.pretestMode) {
        $(Exercises).trigger("updateAnswerHistory", {
            name: Exercises.currentCard.get('exerciseName'),
            pass: false
        });
    }

    $(Exercises).trigger("hintUsed", data);
    // If there aren't any more hints, disable the get hint button
    if (hintsUsed === numHints) {
        $("#hint").attr("disabled", true);
        $(Exercises).trigger("allHintsUsed");
       
        if (userExercise.exerciseStates.struggling) {
            if (hintCanVibration === true) {
                hintCanVibration = false;
                setTimeout(function() {
                    $("#raise-hand-button-container").effect("shake", {times: 3, distance: 5}, 480);
                },0);
            }
        }
    }


    var curTime = new Date().getTime();
    var timeTaken = Math.round((curTime - lastAttemptOrHint) / 1000);
    lastAttemptOrHint = curTime;

    Exercises.userActivityLog.push(["hint-activity", "0", timeTaken]);

    if (!previewingItem && !localMode && !userExercise.readOnly &&
            !Exercises.currentCard.get("preview") && canAttempt) {
        // Don't do anything on success or failure; silently failing is ok here
        request("problems/" + problemNum + "/hint",
                buildAttemptData(false, attempts, "hint", timeTaken, false));
    }
}

function updateHintButtonText() {
    var $hintButton = $("#hint");
    var hintsLeft = numHints - hintsUsed;

    if (hintsAreFree) {
        $hintButton.val(hintsUsed ?
                "下一個步驟 ( 還有 " + hintsLeft + " 個步驟 ）" :
                "解題說明");
    } else {
        $hintButton.val(hintsUsed ?
                "下一個提示 ( 還有 " + hintsLeft + " 個提示 )" :
                "我需要提示");
    }
}

// Build the data to pass to the server
function buildAttemptData(correct, attemptNum, attemptContent, timeTaken,
                          skipped) {
    var framework = Exercises.getCurrentFramework();
    var data;

    if (framework === "perseus") {
        data = PerseusBridge.getSeedInfo();
    } else if (framework === "khan-exercises") {
        data = Khan.getSeedInfo();
    }

    return _.extend(data, {
        // Ask for camel casing in returned response
        casing: "camel",

        // Whether we're moving to the next problem (i.e., correctness)
        correct: correct ? 1 : 0,

        count_hints: hintsUsed,
        time_taken: timeTaken,

        // How many times the problem was attempted
        attempt_number: attemptNum,

        // The answer the user gave
        attempt_content: attemptContent,

        // Whether we're currently in review mode
        review_mode: Exercises.reviewMode ? 1 : 0,

        // Which stage we're at in practice mode
        is_starting: Exercises.isStarting ? 1 : 0,
        is_challenging: Exercises.isChallenging ? 1 : 0,
        is_total_n_correct: Exercises.isTotalNCorrect ? 1 : 0,
        mission_id: Exercises.missionId,

        // Whether we are currently working on a topic, as opposed to an exercise
        topic_mode: 0,

        // should be pretest_mode: (!Exercises.testMode && Exercises.pretestMode) ? 1 : 0,
        // but there's no testMode, so when it's in the preview page, it will go wrong.
        pretest_mode: Exercises.pretestMode ? 1 : 0,

        exam_mode: Exercises.examMode ? 1 : 0,
        exam_id: Exercises.examId,

        // If working in the context of a LearningTask (on the new learning
        // dashboard), supply the task ID.
        task_id: Exercises.learningTask && Exercises.learningTask.get("id"),

        // The current card data
        card: JSON.stringify(Exercises.currentCard),

        // Unique ID of the cached stack
        stack_uid: Exercises.completeStack.getUid(),

        // The current topic, if any
        topic_id: Exercises.topic && Exercises.topic.id,

        // How many cards the user has already done
        cards_done: Exercises.completeStack.length,

        // How many cards the user has left to do
        cards_left: Exercises.incompleteStack.length - 1,

        // The user assessment key if in assessmentMode
        user_assessment_key: Exercises.userAssessmentKey,

        // Whether the user is skipping the question
        skipped: skipped ? 1 : 0,

        // For back-end ExercisePointCalculator caculates points.
        proficient_state: userExercise.exerciseStates['proficient'] ? 1 : 0,

        // For back-end ExercisePointCalculator caluates points
        suggested_state: userExercise.exerciseStates['suggested'] ? 1 : 0
    });
}


var attemptHintQueue = jQuery({});

// If there are any requests left in the queue when the window unloads then we
// will have permanently lost their answers and will need to clear the session
// cache, to make sure we don't override what is passed down from the servers
$(window).unload(function() {
    if (attemptHintQueue.queue().length) {
        $(Exercises).trigger("attemptError", {userExercise: userExercise});
    }
});

function request(method, data) {
    var apiBaseUrl = (Exercises.assessmentMode ?
            "/api/v1/user/assessment/exercises" : "/api/v1/user/exercises");

    var params = {
        // Do a request to the server API
        url: apiBaseUrl + "/" + userExercise.exerciseModel.name + "/" + method,
        type: "POST",
        data: data,
        dataType: "json"
    };

    var deferred = $.Deferred();

    attemptHintQueue.queue(function(next) {
        $.ajax(params).then(function(data, textStatus, jqXHR) {

            //stuggling & attempt answer
            if (data.exerciseStates.struggling && "attemptCorrect" in data.actionResults){
                if (!data.actionResults.attemptCorrect) {
                    var hint_disabled = $("#hint").attr("disabled");

                    if (hint_disabled === "disabled") {
                        if (hintCanVibration === true) {
                            hintCanVibration = false;
                            $("#raise-hand-button").effect("shake", {times: 3, distance: 5}, 480);
                        }
                    }
                    else {
                        if (hintCanVibration === true) {
                             hintCanVibration = false;
                            $("#get-hint-button-container").effect("shake", {times: 3, distance: 5}, 480);
                        }
                    }
                }
            }

            deferred.resolve(data, textStatus, jqXHR);

            // Tell any listeners that we now have new userExercise data
            $(Exercises).trigger("updateUserExercise", {
                userExercise: data,
                source: "serverResponse"
            });
        }, function(jqXHR, textStatus, errorThrown) {
            // Execute passed error function first in case it wants different
            // behavior depending upon the length of the request queue
            // TODO(alpert): Huh? Don't think this matters.
            deferred.reject(jqXHR, textStatus, errorThrown);

            // Clear the queue so we don't spit out a bunch of queued up
            // requests after the error
            attemptHintQueue.clearQueue();
        }).always(function() {
            $(Exercises).trigger("apiRequestEnded");
            next();
        });
    });

    // Trigger an apiRequestStarted event here, and not in the queued function
    // because listeners should know an API request is waiting as soon as it
    // gets queued up.
    $(Exercises).trigger("apiRequestStarted");

    return deferred.promise();
}

function readyForNextProblem(e, data) {

    if (!firstProblem) {
        // As both of the following variables are only used to make sure the
        // client matches the server on pageLoad, we will set them back to 0
        // all other times to be on the safe side and to make sure that hints
        // are not pre-filled in topic-mode when not the first problem.
        data.userExercise.lastCountHints = 0;
        data.userExercise.lastAttemptNumber = 0;
    }
    firstProblem = false;

    userExercise = data.userExercise;
    problemNum = userExercise.totalDone + 1;

    $(Exercises).trigger("updateUserExercise", {userExercise: userExercise});

    // (framework depends on userExercise set above)
    var framework = Exercises.getCurrentFramework();
    if (framework === "perseus") {
        $(PerseusBridge).trigger("readyForNextProblem", data);
    } else if (framework === "khan-exercises") {
        $(Khan).trigger("readyForNextProblem", data);
    }
}

function warning(e, message, showClose) {
    $(function() {
        var warningBar = $("#warning-bar");
        $("#warning-bar-content").html(message);
        if (showClose) {
            warningBar.addClass("warning")
                  .children("#warning-bar-close").show();
        } else {
            warningBar.addClass("error")
                  .children("#warning-bar-close").hide();
        }
        warningBar.fadeIn("fast");
    });
}

function upcomingExercise(e, data) {
    var framework = Exercises.getCurrentFramework(data.userExercise);
    if (framework === "perseus") {
        $(PerseusBridge).trigger("upcomingExercise", data);
    } else if (framework === "khan-exercises") {
        $(Khan).trigger("upcomingExercise", data);
    }
}


function gotoNextProblem() {
    var framework = Exercises.getCurrentFramework();
    if (framework === "perseus") {
        $(PerseusBridge).trigger("gotoNextProblem");
    } else if (framework === "khan-exercises") {
        $(Khan).trigger("gotoNextProblem");
    }
}

function updateUserExercise(e, data) {
    var framework = Exercises.getCurrentFramework();
    if (framework === "perseus") {
        $(PerseusBridge).trigger("updateUserExercise", data);
    } else if (framework === "khan-exercises") {
        $(Khan).trigger("updateUserExercise", data);
    }
}


function enableCheckAnswer() {
    $("#check-answer-button")
        .prop("disabled", false)
        .removeClass("buttonDisabled")
        .val(originalCheckAnswerText);
    setTimeout(function(){
        $("#skip-question-button")
        .prop("disabled", false)
        .removeClass("buttonDisabled");}
        , 2000);
    $('#answerform input[type=submit]').prop('disabled', false);
    $('#questionform input[type=submit]').prop('disabled', false);
}

function disableCheckAnswer() {
    $("#check-answer-button")
        .prop("disabled", true)
        .addClass("buttonDisabled")
        .val($._("Please wait..."));

    $("#skip-question-button")
        .prop("disabled", true)
        .addClass("buttonDisabled");

    $('#answerform input[type=submit]').prop('disabled', true);
    $('#questionform input[type=submit]').prop('disabled', true);
}

function clearExistingProblem() {
    var framework = Exercises.getCurrentFramework();
    enableCheckAnswer();

    $("#happy").hide();
    if (!$("#examples-show").data("show")) {
        // TODO(alpert): What does this do?
        $("#examples-show").click();
    }

    // Toggle the navigation buttons
    $("#check-answer-button").show();
    $("#next-question-button").blur().hide();
    $("#positive-reinforcement").hide();

    // Wipe out any previous problem
    if (framework === "perseus") {
        if(PerseusBridge && PerseusBridge.cleanupProblem) PerseusBridge.cleanupProblem();
    } else if (framework === "khan-exercises") {
        if(Khan && Khan.cleanupProblem) Khan.cleanupProblem();
    }

    $("#workarea, #hintsarea, #solutionarea, #sourcearea").empty();

    // Take off the event handlers for disabling check answer; we'll rebind
    // if we actually want them
    $("#solutionarea").off(".emptyAnswer");

    // Restore the hint button's original appearance
    $("#hint")
        .removeClass("green")
        .addClass("orange")
        .val("我需要提示")
        .data("buttonText", false)
        .appendTo("#get-hint-button-container");
    $(".hint-box")
        .css("top", 0)
        .find(".info-box-header")
            .show();
    if (!localMode) {
        Khan.scratchpad.clear();
    }
}

})();
