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

    var timelinecontainer = $("<div id='timelinecontainer'>")
        .append("<div>\n" +
                "<div id='previous-problem' class='simple-button'>" +
                "上一個問題" + "</div>\n" +
                "\n</div>")
        .append("<div>\n" +
                "<div id='next-problem' class='simple-button'>" +
                "下一個問題" + "</div>\n" +
                "\n</div>")
        .insertBefore("#problem-and-answer");

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

})();
