/**
 * Event handlers for when problem history is being viewed.
 */

(function() {

$(Exercises)
        .bind("newProblem", renderReadOnlyProblem);

function renderReadOnlyProblem(event, args) {
    /* Timeline is removed.
     * If you want to recover timeline,
     * check commit c52d552 in khan-exercises repository.
     */
    var userExercise = args.userExercise;
    var solutionarea = $("#solutionarea");
    if (typeof userExercise !== "undefined" && userExercise.readOnly) {
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
        $.fn.disable = function() {
            this.addClass("disabled")
                .css({
                    cursor: "default !important"
                })
                .data("disabled", true);
            return this;
        }

        $("#next-problem").click(function() {
            window.location.href = userExercise.nextProblemUrl;
        });

        $("#previous-problem").click(function() {
            if (!$(this).data("disabled")) {
                window.location.href = userExercise.previousProblemUrl;
            }
        });

        if (userExercise.totalDone === 0) {
            $("#previous-problem").disable();
        }

        $("#hint").attr("disabled", true);
        $("#answercontent input").attr("disabled", true);
        $("#answercontent select").attr("disabled", true);
    }

}

})();
