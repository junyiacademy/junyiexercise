/* khan-exercise.js

    The main entry point here is essentially the onjQueryLoaded method around
    line 750. It loads in many of the pre-reqs and then calls, one way or
    another, setUserExercise and loadModule for each required module in utils/.

    setProblemNum updates some instance vars that get looked at by other
    functions.

    loadModule will load an individual exercise util module (e.g.,
    word-problems.js, etc). It _also_ loads in the Khan Academy site skin and
    exercise template via injectSite which runs prepareSite first then
    makeProblemBag and makeProblem when it finishes loading dependencies.

    prepareSite and makeProblem are both fairly heavyweight functions.

    If you are trying to register some behavior when the page loads, you
    probably want it to go in either prepareSite here or, if it makes sense, in
    problemTemplateRendered in interface.js. By the time prepareSite is called,
    jQuery and any core plugins are already available.

    If you are trying to do something each time a problem loads, you probably
    want to look at makeProblem.

    At the end of evaluation, the inner Khan object is returned/exposed as well
    as the inner Util object.


    Catalog of events fired on the Khan object by khan-exercises:

    * newProblem -- when a new problem has completely finished rendering

    * hintUsed -- when a hint has been used by the user

    * allHintsUsed -- when all possible hints have been used by the user

    * checkAnswer -- when the user attempts to check an answer, incorrect or
      correct

    * problemDone -- when the user has completed a problem which, in this case,
      usually means supplying the correct answer. Note the user may have made
      multiple attempts to finally get at the correct answer. A summary object
      including {attempts: <number>, card: <Object>} is included as an
      event parameter.

    * attemptError -- when an error occurs during an API attempt

    * apiRequestStarted / apiRequestEnded -- when an API request is sent
      outbound or completed, respectively. Listeners can keep track of whether
      or not khan-exercises is still waiting on API responses.

    * updateUserExercise -- when an updated userExercise has been received
      and is being used by khan-exercises, either via the result of an API
      call or initialization

    * showGuess -- when a guess is populated in the answer area in problem
      history mode
*/

var Khan = (function() {
    // Numbers which are coprime to the number of bins, used for jumping through
    // exercises.  To quickly test a number in python use code like:
    // import fractions
    // fractions.gcd( 197, 200)
    var primes = [197, 3, 193, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43,
    47, 53, 59, 61, 67, 71, 73, 79, 83],

    userExercise,

    // Check to see if we're in local mode
    localMode = typeof Exercises === "undefined",

    // Set in prepareSite when Exercises.init() has already been called
    assessmentMode,

    // The ID, filename, and name of the exercise -- these will only be set here in localMode
    exerciseId = ((/([^\/.]+)(?:\.html)?$/.exec(window.location.pathname) || [])[1]) || "",
    exerciseFile = exerciseId + ".html",
    exerciseName = deslugify(exerciseId),

    // Bin users into a certain number of realms so that
    // there is some level of reproducability in their questions.
    // If you change this, make sure all entries in the array "primes"
    // set above are coprime to the new value.
    bins = 200,

    // Number of past problems to consider when avoiding duplicates
    dupWindowSize = 5,

    // The seed information
    randomSeed,

    // Holds the current username
    user = null,
    userCRC32,

    // The current problem and its corresponding exercise
    problem,
    exercise,

    // The number of the current problem that we're on
    problemNum = 1,

    // Info for constructing the seed
    seedOffset = 0,
    jumpNum = 1,
    problemSeed = 0,
    seedsSkipped = 0,
    consecutiveSkips = 0,

    problemID,

    // The current validator function
    answerData,
    validator,
    getAnswer,

    hints,

    // The exercise elements
    exercises,

    // Where we are in the shuffled list of problem types
    problemBag,
    problemBagIndex = 0,

    // How many problems are we doing? (For the fair shuffle bag.)
    problemCount = 10,

    hintsUsed,

    // Bug-hunting "undefined" attempt content
    debugLogLog = ["start of log"],
    debugLog = function(l) {
        debugLogLog.push(l);
    },

    // Dictionary of loading and loaded exercises; keys are exercise IDs,
    // values are promises that are resolved when the exercise is loaded
    exerciseFilePromises = {},

    // A promise for each loaded or loading module, keyed by module filename
    // (module.src) -- will be resolved when the module is loaded (on the live
    // site, immediately)
    modulePromises = {},

    // Promise that gets resolved when MathJax is loaded
    mathJaxLoaded,

    urlBase = typeof urlBaseOverride !== "undefined" ? urlBaseOverride :
        localMode ? "../" : "/khan-exercises/",

    // In local mode, we use khan-exercises local copy of the /images
    // directory.  But in production (on www.khanacademy.org), we use
    // the canonical location of images, which is under '/'.
    imageBase = ((typeof urlBaseOverride !== "undefined" || localMode)
                 ? (urlBase + "images/") : ("/images/"));


    lastFocusedSolutionInput = null,

    gae_bingo = window.gae_bingo || { bingo: function() {} },

    // The ul#examples (keep in a global because we need to modify it even when it's out of the DOM)
    examples = null;

    // Add in the site stylesheets
    if (localMode) {
        (function() {
            var link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = urlBase + "css/khan-site.css";
            document.getElementsByTagName("head")[0].appendChild(link);

            link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = urlBase + "css/khan-exercise.css";
            document.getElementsByTagName("head")[0].appendChild(link);

            link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = urlBase + "css/grids.css";
            document.getElementsByTagName("head")[0].appendChild(link);

            link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = urlBase + "local-only/katex/katex.css";
            document.getElementsByTagName("head")[0].appendChild(link);
        })();
    }

    // The main Khan Module
    var Khan = {

        // Set of modules currently in use -- keys are module names, value is
        // always true
        modules: {},

        // Map from exercise ID to a list of required modules (data-require),
        // These module names are used in resetModules() and indirectly by
        // runModules(), where $.fn["module-name"], $.fn["module-nameLoad"],
        // and $.fn["module-nameCleanup"] are called.
        exerciseModulesMap: {},

        // So modules can use file paths properly
        urlBase: urlBase,

        imageBase: imageBase,

        startLoadingExercise: startLoadingExercise,

        moduleDependencies: {
            "math": ["raphael"],

            // Load Raphael locally because IE8 has a problem with the 1.5.2 minified release
            // http://groups.google.com/group/raphaeljs/browse_thread/thread/c34c75ad8d431544

            // The normal module dependencies.
            "calculus": ["math", "expressions", "polynomials"],
            "exponents": ["math", "math-format"],
            "kinematics": ["math"],
            "math-format": ["math", "expressions"],
            "polynomials": ["math", "expressions"],
            "stat": ["math"],
            "word-problems": ["math"],
            "derivative-intuition": ["jquery.mobile.vmouse"],
            "unit-circle": ["jquery.mobile.vmouse"],
            "interactive": ["graphie", "jquery.mobile.vmouse"],
            "mean-and-median": ["stat"],
            "math-model": ["ast"],
            "simplify": ["math-model", "ast", "expr-helpers", "expr-normal-form", "steps-helpers"],
            "congruency": ["angles", "interactive"],
            "graphie-3d": ["graphie", "matrix"],
            "graphie-geometry": ["graphie", "matrix"],
            "graphie-helpers": ["math-format"],
            "matrix": ["expressions"],
            "matrix-input": ["jquery.cursor-position"],
            "chemistry": ["math-format"],
            "d3": ["math-format"]
        },

        warnTimeout: function() {
            $(Exercises).trigger("warning", [$._("你的網路連線可能太慢. 請重新整理或" +
                    "向均一回報問題."),
                    false]);
            // TODO(alpert): This event binding is kind of gross
            $("#warn-report").click(function(e) {
                e.preventDefault();
                $("#report").click();
            });
        },

        warnFont: function() {
            var warning;
            if ($.browser.msie) {
                warning = $._("You should " +
                    "<a href='http://missmarcialee.com/2011/08/" +
                    "how-to-enable-font-download-in-internet-explorer-8/' " +
                    "target='_blank'>enable font download</a> " +
                    "to improve the appearance of math expressions."
                );
            } else {
                warning = $._("You should enable font download in your " +
                    "browser to improve the appearance of math expressions");
            }
            // Show the message to users is confusing. Few people can understand it.
            // $(Exercises).trigger("warning", [warning, true]);
        },

        // TODO(alpert): This doesn't need to be in the Khan object.
        getBaseModules: function() {
            var mods = [];
            // Base modules required for every problem
            // MathJax is here because Perseus wants it loaded regardless of if
            // we load a khan-exercises problem that needs it. Previously it
            // was a dependency of 'math' so this isn't really any different.
            mods.push("answer-types", "tmpl", "tex","jquery.adhesion", "calculator",
                {
                    src: urlBase + "utils/MathJax/2.1/MathJax.js?config=KAthJax-da9a7f53e588f3837b045a600e1dc440"
                });

            return mods;
        },

        resetModules: function(exerciseId) {
            var modules = Khan.getBaseModules().concat(
                    Khan.exerciseModulesMap[exerciseId]);
            var moduleSet = {};

            $.each(modules, function(i, mod) {
                useModule(mod);
            });

            Khan.modules = moduleSet;

            function useModule(modNameOrObject) {
                if (typeof modNameOrObject === "string") {
                    moduleSet[modNameOrObject] = true;
                    var deps = Khan.moduleDependencies[modNameOrObject] || [];

                    $.each(deps, function(i, mod) {
                        useModule(mod);
                    });
                } else if (modNameOrObject.name) {
                    moduleSet[modNameOrObject.name] = true;
                }
            }
        },

        // Populate this with modules
        Util: {
            debugLog: debugLog,

            // http://burtleburtle.net/bob/hash/integer.html
            // This is also used as a PRNG in the V8 benchmark suite
            random: function() {
                // Robert Jenkins' 32 bit integer hash function.
                var seed = randomSeed;
                seed = ((seed + 0x7ed55d16) + (seed << 12)) & 0xffffffff;
                seed = ((seed ^ 0xc761c23c) ^ (seed >>> 19)) & 0xffffffff;
                seed = ((seed + 0x165667b1) + (seed << 5)) & 0xffffffff;
                seed = ((seed + 0xd3a2646c) ^ (seed << 9)) & 0xffffffff;
                seed = ((seed + 0xfd7046c5) + (seed << 3)) & 0xffffffff;
                seed = ((seed ^ 0xb55a4f09) ^ (seed >>> 16)) & 0xffffffff;
                return (randomSeed = (seed & 0xfffffff)) / 0x10000000;
            }
        },

        // Load in a collection of scripts, execute callback upon completion
        loadScript: function(url, callback) {
            var head = document.getElementsByTagName("head")[0];
            var isMathJax = url.indexOf("/MathJax/") !== -1;

            if (!localMode && url.indexOf("/khan-exercises/") === 0 &&
                    (!isMathJax || window.MathJax)) {
                // Don't bother loading khan-exercises content in non-local
                // mode; this content is already packaged up and available
                // (*unless* it's MathJax, which is silly and still needs
                // to be loaded (if it's not preloaded))
                callback();
                return;
            }

            // Adapted from jQuery getScript (ajax/script.js) -- can't use
            // jQuery here because we load jQuery using this routine
            var script = document.createElement("script");
            script.async = "async";
            script.src = url;

            script.onerror = function() {
                // No error in IE, but this is mostly for debugging during
                // development so it's probably okay
                // http://stackoverflow.com/questions/2027849/how-to-trigger-script-onerror-in-internet-explorer
                Khan.error("Error loading script " + script.src);
            };

            script.onload = script.onreadystatechange = function() {
                if (!script.readyState ||
                        (/loaded|complete/).test(script.readyState)) {
                    // Handle memory leak in IE
                    script.onload = script.onreadystatechange = null;

                    // Remove the script
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }

                    // Dereference the script
                    script = undefined;

                    if (isMathJax) {
                        // If we're loading MathJax, don't bump up the
                        // count of loaded scripts until MathJax is done
                        // loading all of its dependencies.
                        MathJax.Hub.Queue(mathJaxLoaded.resolve);
                        mathJaxLoaded.then(callback);
                    } else {
                        callback();
                    }
                }
            };

            head.appendChild(script);
        },

        // Query String Parser
        // Original from:
        // http://stackoverflow.com/questions/901115/get-querystring-values-in-javascript/2880929#2880929
        queryString: function() {
            var urlParams = {},
                e,
                a = /\+/g,  // Regex for replacing addition symbol with a space
                r = /([^&=]+)=?([^&]*)/g,
                d = function(s) { return decodeURIComponent(s.replace(a, " ")); },
                q = window.location.search.substring(1);

            while ((e = r.exec(q))) {
                urlParams[d(e[1])] = d(e[2]);
            }

            return urlParams;
        },

        // Display error messages
        error: function() {
            if (typeof console !== "undefined") {
                $.each(arguments, function(ix, arg) {
                    console.error(arg);
                });
            }
        },

        scratchpad: (function() {
            var disabled = false, wasVisible, pad;

            var actions = {
                disable: function() {
                    wasVisible = actions.isVisible();
                    actions.hide();

                    $("#scratchpad-show").hide();
                    $("#scratchpad-not-available").show();
                    disabled = true;
                },

                enable: function() {
                    if (wasVisible) {
                        actions.show();
                        wasVisible = false;
                    }

                    $("#scratchpad-show").show();
                    $("#scratchpad-not-available").hide();
                    disabled = false;
                },

                isVisible: function() {
                    return $("#scratchpad").is(":visible");
                },

                show: function() {

                    if (actions.isVisible()) {
                        return;
                    }

                    var makeVisible = function() {
                        $("#workarea, #hintsarea").css("padding-top", 50);
                        $("#scratchpad").show();
                        $("#scratchpad-show").text("隱藏計算紙");

                        // If pad has never been created or if it's empty
                        // because it was removed from the DOM, recreate a new
                        // scratchpad.
                        if (!pad || !$("#scratchpad div").children().length) {
                            pad = new DrawingScratchpad(
                                $("#scratchpad div")[0]);

                            // add GA_code to scratchpad svg after drawing #scratchpad svg 
                            $("#scratchpad svg").attr("onclick","Analytics.send_ga_event('exercise', 'click', 'scratchpad_used');");
                        }
                    };

                    loadModule("scratchpad").then(makeVisible);
                },

                hide: function() {
                    if (!actions.isVisible()) {
                        return;
                    }

                    $("#workarea, #hintsarea").css("padding-top", 0);
                    $("#scratchpad").hide();
                    $("#scratchpad-show").text("顯示計算紙");
                },

                toggle: function() {
                    actions.isVisible() ? actions.hide() : actions.show();
                },

                clear: function() {
                    if (pad) {
                        pad = null;
                    }
                    $("#scratchpad div").children().remove();
                    if (actions.isVisible()) { // create a new scratch pad
                        pad = new DrawingScratchpad($("#scratchpad div")[0]);
                    }
                },

                resize: function() {
                    if (pad) {
                        pad.resize();
                    }
                }
            };

            return actions;
        })(),

        relatedVideos: {
            exercise: null,
            cache: {},

            getVideos: function() {
                return this.cache[this.exercise.name] || [];
            },

            setVideos: function(exercise) {
                this.resetRelatedVideoBox();
                if (exercise.relatedVideos) {
                    this.cache[exercise.name] = exercise.relatedVideos;
                }

                this.exercise = exercise;
                this.render();
            },

            showThumbnail: function(index) {
                $("#related-video-list .related-video-list li").each(function(i, el) {
                    if (i === index) {
                        $(el)
                            .find("a.related-video-inline").hide().end()
                            .find(".thumbnail").show();
                    }
                    else {
                        $(el)
                            .find("a.related-video-inline").show().end()
                            .find(".thumbnail").hide();
                    }
                });
            },

            // make a link to a related video, appending exercise ID.
            makeHref: function(video) {
                return video.relativeUrl + "?exid=" + this.exercise.name;
            },

            anchorElement: function(video, needComma) {
                var template = Templates.get("video.related-video-link");
                return $(template({
                    href: this.makeHref(video),
                    video: video,
                    separator: needComma
                })).data("video", video);
            },

            render: function() {
                if (localMode) {
                    // Templates isn't available locally and we won't have any
                    // related videos to show anyway
                    return;
                }

                var container = $(".related-video-box");
                var jel = container.find(".related-video-list");

                var self = this;
                var template = Templates.get("video.thumbnail");
                _.each(self.getVideos(), function(video, i) {
                    var thumbnailDiv = $(template({
                        href: self.makeHref(video),
                        video: video,
                        isCN: window.config.site == "cn"
                    })).find("a.related-video")
                        .data("video", video)
                        .end();

                    var inlineLink = self.anchorElement(video)
                        .addClass("related-video-inline");

                    var sideBarLi = $("<li>")
                        .append(inlineLink)
                        .append(thumbnailDiv);

                    if (i > 0) {
                        thumbnailDiv.hide();
                    } else {
                        inlineLink.hide();
                    }
                    jel.append(sideBarLi);
                });

                container.toggle(self.getVideos().length > 0);
                self._bindEvents();
            },

            _eventsBound: false,
            /**
             * Called to initialize related video event handlers.
             * Should only be called after video.js package is loaded.
             */
            _bindEvents: function() {
                if (this._eventsBound) {
                    return;
                }

                // make caption slide up over the thumbnail on hover
                var captionHeight = 45;
                var marginTop = 23;
                // queue:false to make sure these run simultaneously
                var options = {duration: 150, queue: false};
                $(".related-video-box")
                    .delegate(".thumbnail", "mouseenter mouseleave", function(e) {
                        var isMouseEnter = e.type === "mouseenter";
                        $(e.currentTarget).find(".thumbnail_label").animate(
                                {marginTop: marginTop + (isMouseEnter ? 0 : captionHeight)},
                                options)
                            .end()
                            .find(".thumbnail_teaser").animate(
                                {height: (isMouseEnter ? captionHeight : 0)},
                                options);
                    });

                ModalVideo.hookup();
                this._eventsBound = true;
            },
            resetRelatedVideoBox: function(){
                var container = $(".related-video-box");
                container.hide();
                container.find(".related-video-list").empty();
            }
        },

        getSeedInfo: function() {
            return {
                // A hash representing the exercise version
                sha1: typeof userExercise !== "undefined" ?
                        userExercise.exerciseModel.sha1 : exerciseId,
                seed: problemSeed,
                problem_type: problemID
            };
        },

        getIssueInfo: function() {
            var path = exerciseFile + "?seed=" + problemSeed + "&problem=" +
                        problemID,
                pathlink = "[" + path + (exercise.data("name") !== exerciseId ? " (" + exercise.data("name") + ")" : "") + "](http://sandcastle.khanacademy.org/media/castles/Khan:master/exercises/" + path + "&debug)",
                historyLink = "[Answer timeline](" + "http://sandcastle.khanacademy.org/media/castles/Khan:master/exercises/" + path + "&debug&activity=" + encodeURIComponent(JSON.stringify(Exercises.userActivityLog)).replace(/\)/g, "\\)") + ")",
                userHash = "User hash: " + KhanUtil.crc32(user),

                parts = [pathlink, historyLink,
                        "    " + JSON.stringify(Exercises.guessLog), userHash],
                body = $.grep(parts, function(e) { return e != null; }).join("\n\n");

            return {
                pretitle: exerciseName,
                bodyInfo: body
            };
        },

        asc: function(text) {  // 全型轉半型的 function
            if (typeof text != "string") {
                return text
            }
            var asciiTable = "!\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
            var big5Table = "%uFF01%u201D%uFF03%uFF04%uFF05%uFF06%u2019%uFF08%uFF09%uFF0A%uFF0B%uFF0C%uFF0D%uFF0E%uFF0F%uFF10%uFF11%uFF12%uFF13%uFF14%uFF15%uFF16%uFF17%uFF18%uFF19%uFF1A%uFF1B%uFF1C%uFF1D%uFF1E%uFF1F%uFF20%uFF21%uFF22%uFF23%uFF24%uFF25%uFF26%uFF27%uFF28%uFF29%uFF2A%uFF2B%uFF2C%uFF2D%uFF2E%uFF2F%uFF30%uFF31%uFF32%uFF33%uFF34%uFF35%uFF36%uFF37%uFF38%uFF39%uFF3A%uFF3B%uFF3C%uFF3D%uFF3E%uFF3F%u2018%uFF41%uFF42%uFF43%uFF44%uFF45%uFF46%uFF47%uFF48%uFF49%uFF4A%uFF4B%uFF4C%uFF4D%uFF4E%uFF4F%uFF50%uFF51%uFF52%uFF53%uFF54%uFF55%uFF56%uFF57%uFF58%uFF59%uFF5A%uFF5B%uFF5C%uFF5D%uFF5E";
        
            var result = "";
            for (var i = 0; i < text.length; i++) {
                var val = escape(text.charAt(i));
                var j = big5Table.indexOf(val);
                result += (((j > -1) && (val.length == 6)) ? asciiTable.charAt(j / 6) : text.charAt(i));
            }   
            return result;
        },

        scoreInput: function() {
            var guess = getAnswer();
            var asc_transform_list = ["text", "number", "decimal", "set", "multiple"];
            if (asc_transform_list.indexOf(Khan.answerType) >= 0) {
                    if (Array.isArray(guess)) {
                        for (index = 0; index < guess.length; ++index) {
							if (Array.isArray(guess[index])) {
								for (sub_index = 0; sub_index < guess[index].length;++sub_index) {
									guess[index][sub_index] = Khan.asc(guess[index][sub_index]);
								}
							}
							else{
								guess[index] = Khan.asc(guess[index]);
							}
                        }
                    }
                    else {
                        guess = Khan.asc(guess);
                    }
            }  // 全型轉半型
            return validator(guess);
        },

        cleanupProblem: function() {
            $("#workarea, #hintsarea").runModules(problem, "Cleanup");
        }
    };
    // see line 183. this ends the main Khan module

    // Load query string params
    Khan.query = Khan.queryString();

    if (Khan.query.activity !== undefined) {
        userExercise = {
            current: true,
            exerciseModel: {},
            readOnly: true,
            userActivity: JSON.parse(Khan.query.activity)
        };
    }

    // Seed the random number generator with the user's hash
    randomSeed = localMode && parseFloat(Khan.query.seed) || userCRC32 ||
            (new Date().getTime() & 0xffffffff);

    if (localMode) {
        // Load in jQuery and underscore, as well as the interface glue code
        // TODO(cbhl): Don't load history.js if we aren't in readOnly mode.
        var initScripts = [
                urlBase+"local-only/jquery.js",
                urlBase+"local-only/jquery-migrate-1.1.1.js",
                urlBase+"local-only/jquery-ui-1.9.2.custom.js",
                urlBase+"local-only/jquery.qtip.js",
                urlBase+"local-only/underscore.js",
                urlBase+"local-only/jed.js",
                urlBase+"local-only/i18n.js",
                // TODO(csilvers): I18N: pick the file based on lang=XX param
                urlBase+"local-only/localeplanet/icu.en-US.js",
                urlBase+"local-only/i18n.js",
                urlBase+"local-only/katex/katex.js",
                urlBase+"exercises-stub.js",
                urlBase+"history.js",
                urlBase+"interface.js"
            ];

        (function loadInitScripts() {
            if (initScripts.length) {
                var src = initScripts.shift();
                Khan.loadScript(src, loadInitScripts);
            } else {
                onjQueryLoaded();
            }
        })();
    } else {
        onjQueryLoaded();
    }

    function onjQueryLoaded() {
        initEvents();

        // Initialize to an empty jQuery set
        exercises = $();

        mathJaxLoaded = $.Deferred();
        Khan.mathJaxLoaded = mathJaxLoaded.promise();

        $(function() {
            var promises = [];

            // Load all base modules, and if this is local mode, any specified
            // in the data-require on <html>
            var mods = Khan.getBaseModules();
            if (localMode) {
                var modString = document.documentElement.getAttribute(
                        "data-require") || "";
                var exMods = modString.length ? modString.split(" ") : [];

                Khan.exerciseModulesMap[exerciseId] = exMods;
                mods.push.apply(mods, exMods);
            }

            $.each(mods, function(i, mod) {
                promises.push(loadModule(mod));
            });

            // Ensure that all local exercises that don't have a data-name
            // already get tagged with the current, original data-name.
            $("div.exercise").not("[data-name]").data("name", exerciseId);

            var remoteExercises = $("div.exercise[data-name]");

            remoteExercises.each(function() {
                promises.push(loadExercise(this));
            });

            // All remote exercises (if any) have now been loaded
            $.when.apply($, promises).then(function() {
                loadTestModeSite();
            });
        });

        $.fn.extend({
            // Pick a random element from a set of elements
            getRandom: function() {
                return this.eq(Math.floor(this.length * KhanUtil.random()));
            },

            // Run the methods provided by a module against some elements
            runModules: function(problem, type) {
                type = type || "";

                var info = {
                    localMode: localMode
                };

                return this.each(function(i, elem) {
                    elem = $(elem);

                    // Run the main method of any modules
                    $.each(Khan.modules, function(mod) {
                        if ($.fn[mod + type]) {
                            debugLog("running " + mod + type);
                            elem[mod + type](problem, info);
                            debugLog("ran " + mod + type);
                        } else {
                            debugLog("(" + mod + type + " not a fn; src " + mod.src + ")");
                        }
                    });
                });
            }
        });

        // See if an element is detached
        $.expr[":"].attached = function(elem) {
            return $.contains(elem.ownerDocument.documentElement, elem);
        };
    }

    // Add up how much total weight is in each exercise so we can adjust for
    // it later
    function weighExercises(problems) {
        if (exercises.length > 1) {
            $.map(problems, function(elem) {
                elem = $(elem);

                var exercise = elem.parents("div.exercise").eq(0);

                var exerciseTotal = exercise.data("weight-sum");
                exerciseTotal = exerciseTotal !== undefined ? exerciseTotal : 0;

                var weight = elem.data("weight");
                weight = weight !== undefined ? weight : 1;

                exercise.data("weight-sum", exerciseTotal + weight);
            });
        }
    }

    // Create a set of n problems fairly from the weights - not random; it
    // ensures that the proportions come out as fairly as possible with ints
    // (still usually a little bit random).
    // There has got to be a better way to do this.
    function makeProblemBag(problems, n, force_random) {
        var bag = [], totalWeight = 0;

        if (problems.length > 0) {
            // Collect the weights for the problems and find the total weight
            var weights = $.map(problems, function(elem, i) {
                elem = $(elem);

                var exercise = elem.parents("div.exercise").eq(0);
                var exerciseWeight = exercise.data("weight");
                exerciseWeight = exerciseWeight !== undefined ? exerciseWeight : 1;
                var exerciseTotal = exercise.data("weight-sum");

                var weight = elem.data("weight");
                weight = weight !== undefined ? weight : 1;

                if (exerciseTotal !== undefined) {
                    weight = weight * exerciseWeight / exerciseTotal;
                    elem.data("weight", weight);
                }

                // Also write down the index/id for each problem so we can do
                // links to problems (?problem=17)
                elem.data("id", elem.attr("id") || "" + i);

                totalWeight += weight;
                return weight;
            });

            while (n) {
                bag.push((function() {
                    // Figure out which item we're going to pick
                    if (force_random !== undefined && force_random == true) {
                        var index = totalWeight * Math.random();
                    } else {
                        var index = totalWeight * KhanUtil.random();
                    }

                    for (var i = 0; i < problems.length; i++) {
                        if (index < weights[i] || i === problems.length - 1) {
                            var w = Math.min(weights[i], totalWeight / (n--));
                            weights[i] -= w;
                            totalWeight -= w;
                            return problems.eq(i);
                        } else {
                            index -= weights[i];
                        }
                    }

                    // This will never happen
                    return Khan.error("makeProblemBag got confused w/ index " + index);
                })());
            }
        }

        return bag;
    }

    // TODO(alpert): Merge with loadExercise
    function startLoadingExercise(exerciseId, exerciseName, exerciseFile, exerciseIsQuiz) {
        var promise = exerciseFilePromises[exerciseId];
        if (promise != null) {
            // Already started (or finished) loading this exercise
            return promise;
        }

        // TODO(alpert): Creating an HTML element here makes no sense to me
        var exerciseElem = $("<div>")
            .data("name", exerciseId)
            .data("displayName", exerciseName)
            .data("fileName", exerciseFile)
            .data("rootName", exerciseId)
            .data("isQuiz", exerciseIsQuiz);

        // Queue up an exercise load
        return loadExercise(exerciseElem);
    }

    function loadAndRenderExercise(nextUserExercise) {

        setUserExercise(nextUserExercise);

        var typeOverride = userExercise.problemType,
            seedOverride = userExercise.seed;

        exerciseId = userExercise.exerciseModel.name;
        exerciseName = userExercise.exerciseModel.displayName;
        exerciseFile = userExercise.exerciseModel.fileName;
        isQuiz = userExercise.exerciseModel.isQuizExercise;

        function finishRender() {
            // Get all problems of this exercise type...
            // TODO(alpert): What happens if multiple summatives in topic mode
            // have the same subexercises? (Or if the subexercises appear in
            // the topic individually.)
            var problems = exercises.filter(function() {
                return $.data(this, "rootName") === exerciseId;
            }).children(".problems").children();

            // ...and create a new problem bag with problems of our new exercise type.
            problemBag = makeProblemBag(problems, 10, userExercise.exerciseModel.isQuizExercise);
            
            // Update related videos
            Khan.relatedVideos.setVideos(userExercise.exerciseModel);

            // Make scratchpad persistent per-user
            if (user) {
                var lastScratchpad = window.localStorage["scratchpad:" + user];
                if (typeof lastScratchpad !== "undefined" && JSON.parse(lastScratchpad)) {
                    Khan.scratchpad.show();
                }
            }

            $(Exercises).trigger("clearExistingProblem");

            // Generate a new problem
            makeProblem(0, typeOverride, seedOverride);

        }

        startLoadingExercise(exerciseId, exerciseName, exerciseFile, isQuiz).then(
            function() {
                finishRender();
            });
    }

    /**
     * Returns whether we should skip the current problem because it's
     * a duplicate (or too similar) to a recently done problem in the same
     * exercise.
     */
    function shouldSkipProblem() {
        // We don't need to skip duplicate problems in test mode, which allows
        // us to use the LocalStore localStorage abstraction from shared-package
        if (typeof LocalStore === "undefined") {
            return false;
        }

        var cacheKey = "prevProblems:" + user + ":" + exerciseName;
        var cached = LocalStore.get(cacheKey);
        var lastProblemNum = (cached && cached["lastProblemNum"]) || 0;

        if (lastProblemNum === problemNum && !userExercise.exerciseModel.isQuizExercise) {
            // Getting here means the user refreshed the page or returned to
            // this exercise after being away. So, we don't need to and
            // shouldn't skip this problem.
            return false;
        }

        var pastHashes = (cached && cached["history"]) || [];
        var varsHash = $.tmpl.getVarsHash();

        // Should skip the current problem if we've already seen it in the past
        // few problems, but not if we've been fruitlessly skipping for a while.
        // The latter situation could happen if a problem has very few unique
        // problems (eg. exterior angles problem type of angles_of_a_polygon).
        if (userExercise.exerciseModel.isQuizExercise){
            dupWindowSize = 9;
        }else {
            dupWindowSize = 5;
        }
        if (_.contains(pastHashes, varsHash) && consecutiveSkips < dupWindowSize) {
            consecutiveSkips++;
            return true;
        } else {
            consecutiveSkips = 0;
            pastHashes.push(varsHash);
            while (pastHashes.length > dupWindowSize) {
                pastHashes.shift();
            }

            LocalStore.set(cacheKey, {
                lastProblemNum: problemNum,
                history: pastHashes
            });
            return false;
        }
    }


    function checkIfAnswerEmpty(guess) {
        // If multiple-answer, join all responses and check if that's empty
        // Remove commas left by joining nested arrays in case multiple-answer is nested
        return $.trim(guess) === "" || (guess instanceof Array &&
                 $.trim(guess.join("").replace(/,/g, "")) === "");
    }

    function makeProblem(skipCount, id, seed) {
        if (!skipCount) {
            skipCount = 0;
        }

        debugLog("start of makeProblem");

        // Enable scratchpad (unless the exercise explicitly disables it later)
        Khan.scratchpad.enable();

        // Allow passing in a random seed
        if (typeof seed !== "undefined") {
            problemSeed = seed;

        // If no user, just pick a random seed
        } else if (user == null) {
            problemSeed = Math.abs(randomSeed % bins);
        }

        // Set randomSeed to what problemSeed is (save problemSeed for recall later)
        randomSeed = problemSeed;

        // Check to see if we want to test a specific problem
        if (localMode || Khan.query.problem != undefined) {
            id = typeof id !== "undefined" ? id : Khan.query.problem;
        }

        if (typeof id !== "undefined") {
            var problems = exercises.children(".problems").children();

            problem = /^\d+$/.test(id) ?
                // Access a problem by number
                problems.eq(parseFloat(id)) :

                // Or by its ID
                problems.filter("#" + id);
        }
        // Otherwise we grab a problem at random from the bag of problems
        // we made earlier to ensure that every problem gets shown the
        // appropriate number of times
        else if (Exercises.examMode) {
            var problems = exercises.children(".problems").children();
            id = Exercises.currentCard.attributes.quizPid;
            problem = problems.filter("#"+id);
        } else if (problemBag.length > 0) {
            problem = problemBag[(problemBagIndex + skipCount) % problemCount];
            id = problem.data("id");
        } else {
            return;
        }

        problemID = id;

        // Find which exercise this problem is from
        exercise = problem.parents("div.exercise").eq(0);

        debugLog("chose problem type and seed");

        // Work with a clone to avoid modifying the original
        problem = problem.clone();

        debugLog("cloned problem");

        // problem has to be child of visible #workarea for MathJax metrics to all work right
        $("#workarea").append(problem);

        // If there's an original problem, add inherited elements
        var parentType = problem.data("type");

        while (parentType) {
            // Copy over the parent element to the child
            var original = exercise.find(".problems #" + parentType).clone();
            problem.prepend(original.children().data("inherited", true));

            // Keep copying over the parent elements (allowing for deep inheritance)
            parentType = original.data("type");
        }

        // prepend any motivational text for the growth mindset A/B test
        var growthHeader = (!localMode && !assessmentMode &&
                Exercises.currentCard.attributes.growthHeader);
        $("#workarea").prepend(growthHeader);

        // Add any global exercise defined elements
        problem.prepend(exercise.children(":not(.problems)").clone().data("inherited", true));

        debugLog("cloned global elements");

        // Apply templating
        var children = problem
            // var blocks append their contents to the parent
            .find(".vars").tmplApply({attribute: "class", defaultApply: "appendVars"}).end()

            // Individual variables override other variables with the same name
            .find(".vars [id]").tmplApply().end()

            // We also look at the main blocks within the problem itself to override,
            // ignoring graphie and spin blocks
            .children("[class][class!='graphie'][class!='spin']").tmplApply({attribute: "class"});

        debugLog("ran tmplApply to vars and main elements");

        // Finally we do any inheritance to the individual child blocks (such as problem, question, etc.)
        children.each(function() {
            // Apply while adding problem.children() to include
            // template definitions within problem scope
            $(this).find("[id]").add(children).tmplApply();
        });

        debugLog("ran tmplApply to [id]");

        // Fix labels' position on the img
        fixLabel();

        // Remove and store hints to delay running modules on it
        hints = problem.children(".hints").remove();

        // Only show the calculator if it's specifically allowed for this problem
        if (problem.data("calculator") == null) {
            $("#calculator").hide();
        } else {
            $("#calculator").show();
        }

        debugLog("removed hints from DOM");

        // Evaluate any inline script tags in this exercise's source
        $.each(exercise.data("script") || [], function(i, scriptContents) {
            $.globalEval(scriptContents);
        });

        debugLog("evaled inline scripts");

        // ...and inline style tags.
        if (exercise.data("style")) {
            var exerciseStyleElem = $("head #exercise-inline-style");

            // Clear old exercise style definitions
            if (exerciseStyleElem.length && exerciseStyleElem[0].styleSheet) {
                // IE refuses to modify the contents of <style> the normal way
                exerciseStyleElem[0].styleSheet.cssText = "";
            } else {
                exerciseStyleElem.empty();
            }

            // Then add rules specific to this exercise.
            $.each(exercise.data("style"), function(i, styleContents) {
                if (exerciseStyleElem.length && exerciseStyleElem[0].styleSheet) {
                    // IE refuses to modify the contents of <style> the normal way
                    exerciseStyleElem[0].styleSheet.cssText = exerciseStyleElem[0].styleSheet.cssText + styleContents;
                } else {
                    exerciseStyleElem.append(styleContents);
                }
            });
        }

        debugLog("added inline styles");

        // Get the filename of the currently shown exercise, then reset modules
        // to only those required by the current exercise
        var exerciseId = exercise.data("name");
        Khan.resetModules(exerciseId);

        // Run the main method of any modules
        problem.runModules(problem, "Load");
        debugLog("done with runModules Load");
        problem.runModules(problem);
        debugLog("done with runModules");

        if (!(localMode || userExercise.readOnly) && typeof seed === "undefined" && shouldSkipProblem()) {
            // If this is a duplicate problem we should skip, just generate
            // another problem of the same problem type but w/ a different seed.
            debugLog("duplicate problem!");
            $(Exercises).trigger("clearExistingProblem");
            if(userExercise.exerciseModel.isQuizExercise) {
                return makeProblem(skipCount + 1);
            } else {
                nextSeed(1);
                return makeProblem();
            }
            
        }

        // Store the solution to the problem
        var solution = problem.find(".solution"),

            // Get the multiple choice problems
            choices = problem.find(".choices"),

            // Get the area into which solutions will be inserted,
            // Removing any previous answer
            solutionarea = $("#solutionarea").empty(),

            // See if we're looking for a specific style of answer
            answerType = solution.data("type");

        // Make sure that the answer type exists
        if (answerType) {
            if (Khan.answerTypes && !Khan.answerTypes[answerType]) {
                Khan.error("Unknown answer type specified: " + answerType);
                return;
            }
        }

        if (!answerType) {
            // If a multiple choice block exists
            if (choices.length) {
                answerType = "radio";

            // Otherwise we assume the smart number type
            } else {
                answerType = "number";
            }
        }

        Khan.answerType = answerType
        // Generate a type of problem
        // (this includes possibly generating the multiple choice problems,
        // if this fails then we will need to try generating another one.)
        debugLog("decided on answer type " + answerType);
        answerData = Khan.answerTypes[answerType].setup(solutionarea, solution);

        // show fraction input 
        if (solution.data("fraction-input") === true){
            solutionarea.find("#fraction_mode_entry").show();
        }

        validator = answerData.validator;
        getAnswer = answerData.answer;
        debugLog("validator created");

        // A working solution was generated
        if (validator) {
            // Have MathJax redo the font metrics for the solution area
            // (ugh, this is gross)
            MathJax.Hub.Queue(["Reprocess", MathJax.Hub,
                    $("#solutionarea")[0]]);

            // Focus the first input
            // Use .select() and on a delay to make IE happy
            var firstInput = solutionarea.find(":input").first();
            if ($(".calculator input:visible").length) {
                firstInput = $(".calculator input");
            }

            setTimeout(function() {
                if (!firstInput.is(":disabled" ) && !/iPad/i.test(navigator.userAgent)) {
                    firstInput.focus();
                    if (firstInput.is("input:text")) {
                        firstInput.select();
                    }
                }
            }, 100);

            lastFocusedSolutionInput = firstInput;
            solutionarea.find(":input").focus(function() {
                // Save which input is focused so we can refocus it after the user hits Check Answer
                lastFocusedSolutionInput = this;
            });
        } else {
            // Making the problem failed, let's try again
            debugLog("validator was falsey");
            problem.remove();
            makeProblem(skipCount, id, randomSeed);
            return;
        }

        // Remove the solution and choices elements from the display
        solution.remove();
        choices.remove();
        

        // Add the problem into the page
        Khan.scratchpad.resize();

        // Enable the all answer input elements except the check answer button.
        $("#answercontent input").not("#check-answer-button")
            .prop("disabled", false);


        // Show acceptable formats
        if (examples !== null && answerData.examples && answerData.examples.length > 0) {
            examples.empty();

            $.each(answerData.examples, function(i, example) {
                examples.append("<li>" + example + "</li>");
            });

            examples.children().tmpl();

            if (examples.length && examples.text().length > 0 && $.prototype.qtip != null) {
                var inputs = $('#solutionarea input[type=text]:not([readonly])').not("div #fraction_mode_div input");
                if(inputs.length >= 1) {
                    inputs.each(function() {
                        $( this ).qtip({
                            content: {
                                text: examples.clone().runModules(),
                                prerender: true
                            },
                            style: {
                                classes: "ui-tooltip-light leaf-tooltip"
                            },
                            position: {
                                viewport: $(window),
                                my: "top left",
                                at: "bottom right",
                            },
                            show: 'focus',
                            hide: 'blur',
                            container: $("#solutionarea"),
                            adjust: { resize: true },
                            style: { classes: 'ui-tooltip-light', width: "250px" },
                        });

                    });
                }
                else if($('#problemarea input[type=text]:not([readonly])').length >= 1) { 
                    $('#problemarea input[type=text]:not([readonly])').each(function() {
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
                            hide: 'blur',
                            container: $("#problemarea"),
                        });
                    });
                    
                }
                else {
                    $('#solutionarea').prepend('<div class="instruction">'+examples.text()+'</div>');
                }
            }
        }
        // save a normal JS array of hints so we can shift() through them later
        hints = hints.tmpl().children().get();

        // Hook out for exercise test runner
        if (localMode && parent !== window && typeof parent.jQuery !== "undefined") {
            parent.jQuery(parent.document).trigger("problemLoaded", [makeProblem, answerData.solution]);
        }

        $("#hint").val("我需要提示");

        $(Exercises).trigger("newProblem", {
            numHints: hints.length,
            userExercise: userExercise,
            answerData: answerData,
            answerType: answerType,
            solution: solution,
            hints: hints,
            problem: problem
        });

        hintsUsed = userExercise ? userExercise.lastCountHints : 0;

        // The server says the user has taken hints on this problem already
        // show all lastCountHints it says we have seen
        _(hintsUsed).times(showHint);

        // Build debugMode in localMode.
        if (localMode){
            renderDebugInfo();
        }
        
        // If the textbox is empty disable "Check Answer" button
        // Note: We don't do this for multiple choice, number line, etc.
        if (answerType === "text" || answerType === "number") {
            var checkAnswerButton = $("#check-answer-button");
            var skipQuestionButton = $("#skip-question-button");
            checkAnswerButton.attr("disabled", "disabled").attr(
                "title", $._("Type in an answer first."));
            // Enables the check answer button - added so that people who type
            // in a number and hit enter quickly do not have to wait for the
            // button to be enabled by the key up
            $("#solutionarea")
                .on("keypress.emptyAnswer", function(e) {
                    if (e.keyCode !== 13) {
                        checkAnswerButton.prop("disabled", false)
                            .removeAttr("title");
                    }
                })
                .on("keyup.emptyAnswer", function(e) {
                    var guess = getAnswer();
                    if (checkIfAnswerEmpty(guess)) {
                        skipQuestionButton.prop("disabled", false);
                        checkAnswerButton.prop("disabled", true);
                    } else if (e.keyCode !== 13) {
                        // Enable check answer button again as long as it is
                        // not the enter key
                        checkAnswerButton.prop("disabled", false);
                        skipQuestionButton.prop("disabled", true);
                    }
                });

        }

        return answerType;
    }
    /*
        [Benny Hisao]
        Mark wantMoreHints because this button is not necessary now.
        It may be useful for future so we do not remove it.
    */
    /*function wantMoreHints() {
        var button = '<div id="want-more-hints" style="display:none"><input type="button" class="simple-button green" value="請多給我一些提示，謝謝！"></div>';
        $('#hintsarea').append(button);
        $('#want-more-hints').fadeIn('slow');
        var exercise_name = this.Exercises.BottomlessQueue.current.card.attributes.exerciseName;

        $("#want-more-hints").click(function(e) {
            e.preventDefault();
            $.ajax({ url: "/api/v1/user/want_more_hints", 
                type: 'PUT',
                data:{'exercise_name': exercise_name, 'problem_id': problemID},
                success: function() {
                }, 
                error: function() {
                    alert('均一小天使：有錯誤，麻煩回報給均一，謝謝。'); 
                } 
            });
            $("#want-more-hints input")
                .attr("disabled", "disabled")
                .attr("value", "均一小天使：我們知道囉！")
                .removeClass('green')
                .addClass('blue');
            $("#want-more-hints").fadeOut(3000);
        });
    }*/

    function showHint() {
        // Called when user hits hint button triggering showHint event or when
        // the server side data says the last_count_hints is not 0 when
        // exercise is loaded.
        var hint = hints.shift();
        if (!hint) {
            // :(
            return;
        }

        hintsUsed++;

        var problem = $(hint).parent();

        // Append first so MathJax can sense the surrounding CSS context properly
        $(hint).appendTo("#hintsarea").runModules(problem);

        if (hints.length === 0) {
            $(hint).addClass("last-hint");
            //wantMoreHints();
        }

        // TODO(james): figure out a way to trigger hintUsed to ensure that the
        // cards are updated properly, but make sure the the ajax calls to
        // submit the hints are not resubmited for the case where we are
        // calling this function because last_count_hints was not 0
    }

    function renderDebugInfo() {
        // triggered on newProblem

        if (userExercise == null || Khan.query.debug != null) {
            $("#problem-permalink").text("Permalink: " +
                                         problemID + " #" +
                                         problemSeed)
                .attr("href", window.location.protocol + "//" + window.location.host + window.location.pathname + "?debug&problem=" + problemID + "&seed=" + problemSeed);
        }

        // Show the debug info
        if (localMode && Khan.query.debug != null) {
            $(document).keypress(function(e) {
                if (e.charCode === 104) {
                    $("#hint").click();
                }
            });
            var debugWrap = $("#debug").css({"margin-right": "15px"}).empty();
            var debugURL = window.location.protocol + "//" + window.location.host + window.location.pathname +
                "?debug&problem=" + problemID;

            $("<h3>Debug Info</h3>").appendTo(debugWrap);

            var src = exercise.data("src");
            if (src != null) {
                var srcInfo = $("<p>").appendTo(debugWrap);
                srcInfo.append("From ");

                $("<a>")
                    .text(src)
                    .attr("href", src + "?debug")
                    .appendTo(srcInfo);
            }

            var links = $("<p>").appendTo(debugWrap);

            if (!Khan.query.activity) {
                var historyURL = debugURL + "&seed=" + problemSeed + "&activity=";
                $("<a>Problem history</a>").attr("href", "javascript:").click(function() {
                    window.location.href = historyURL + encodeURIComponent(
                            JSON.stringify(Exercises.userActivityLog));
                }).appendTo(links);
            } else {
                $("<a>Random problem</a>")
                    .attr("href", window.location.protocol + "//" +
                            window.location.host + window.location.pathname +
                            "?debug")
                    .appendTo(links);
            }

            links.append("<br><b>Problem types:</b><br>");

            exercises.children(".problems").children().each(function(n, prob) {
                var probID = $(prob).attr("id") || n;
                links.append($("<div>")
                    .css({
                        "padding-left": "20px",
                        "outline":
                            (problemID === probID || problemID === "" + n) ?
                            "1px dashed gray" : ""
                    })
                    .append($("<span>").text(n + ": "))
                    .append($("<a>")
                        .text(probID)
                        .attr("href", window.location.protocol + "//" +
                            window.location.host + window.location.pathname +
                            "?debug&problem=" + probID)
                    ));
            });


            // If this is a child exercise, show which one it came from
            if (exercise.data("name") !== exerciseId) {
                links.append("<br>");
                links.append("Original exercise: " + exercise.data("name"));
            }

            if ($.tmpl.DATA_ENSURE_LOOPS > 0) {
                var dataEnsureInfo = $("<p>");
                dataEnsureInfo.append("Data-ensure loops: " + $.tmpl.DATA_ENSURE_LOOPS);
                if ($.tmpl.DATA_ENSURE_LOOPS > 15) {
                    dataEnsureInfo.css("background-color", "yellow");
                }
                if ($.tmpl.DATA_ENSURE_LOOPS > 30) {
                    dataEnsureInfo.css("background-color", "orange");
                }
                if ($.tmpl.DATA_ENSURE_LOOPS > 50) {
                    dataEnsureInfo.css("background-color", "red");
                }
                dataEnsureInfo.appendTo(debugWrap);
            }

            if (typeof $.tmpl.VARS !== "undefined") {
                var varInfo = $("<p>");

                $.each($.tmpl.VARS, function(name, value) {
                    var str;

                    if (typeof value === "function") {
                        str = value.toString();
                    } else {
                        // JSON is prettier (when it works)
                        try {
                            str = JSON.stringify(value);
                        } catch (e) {
                            str = value.toString();
                        }
                    }

                    varInfo.append($("<b>").text(name));
                    varInfo.append(": ");
                    varInfo.append($("<var>").text(str));
                    varInfo.append("<br>");
                });

                varInfo.appendTo(debugWrap);
            }

            // for special style rules

            $("body").addClass("debug");
        }
    }

    function renderExerciseBrowserPreview() {
        // triggered on newProblem

        // Version of the site used by Khan/exercise-browser for the iframe
        // preview
        if (localMode && Khan.query.browse != null) {
            $("html").addClass("exercise-browser");

            var browseWrap = $("#browse").empty();

            var links = $("<div>").addClass("problem-types");

            links.append($("<b>").text("Problem types:"));

            exercises.children(".problems").children().each(function(n, prob) {
                var probName = $(prob).attr("id");
                var probID = probName || n;
                var weight = $(prob).data("weight");
                weight = weight != null ? weight : 1;

                if (weight !== 0) {
                    $("<a>").addClass("problem-type-link")
                        .text("#" + (n + 1) +
                            (probName != null ? ": " + probName : ""))
                        .attr("href", window.location.protocol + "//" +
                            window.location.host + window.location.pathname +
                            "?browse&problem=" + probID)
                        .appendTo(links);
                }
            });

            browseWrap.append(links);
        }
    }

    function renderNextProblem(data) {
        if (localMode) {
            // Just generate a new problem from existing exercise
            $(Exercises).trigger("clearExistingProblem");
            makeProblem();
        } else {
            loadAndRenderExercise(data.userExercise);
        }
    }

    /**
     * Called once each time an exercise page is initialized.
     * For multi-exercise pages, this can be called multiple times!
     * (e.g. in a tutorial view, where there is client side navigation between
     * different exercises).
     */
    function prepareSite() {
        // Grab example answer format container
        examples = $("#examples");
        assessmentMode = !localMode && Exercises.assessmentMode;

        function initializeCalculator() {
            var calculator = $(".calculator"),
                history = calculator.children(".history"),
                inputRow = history.children(".calc-row.input"),
                input = inputRow.children("input"),
                buttons = calculator.find("a"),
                lastInstr = "",
                ans;

            var evaluate = function() {
                var instr = input.val();
                var row, indiv, output, outstr, outdiv;
                if ($.trim(instr) !== "") {
                    lastInstr = instr;
                    row = $("<div>").addClass("calc-row");
                    indiv = $("<div>").addClass("input").text(instr).appendTo(row);
                    try {
                        output = ans = Calculator.calculate(instr, ans);
                        if (typeof output === "number") {
                            outstr = Math.round(output * 1000000000) / 1000000000;
                        } else {
                            outstr = output;
                        }
                    } catch (e) {
                        if (e instanceof Calculator.CalculatorError) {
                            outstr = e.message;
                        } else {
                            throw e;
                        }
                    }
                    outdiv = $("<div>").addClass("output").text(outstr).appendTo(row);
                    inputRow.before(row);
                }

                input.val("");
                input[0].scrollIntoView(false);
            };

            input.on("keyup", function(e) {
                if (e.which === 13) {
                    evaluate();
                    return false;
                } else if (e.which === 38) {
                    if (lastInstr !== "") {
                        input.val(lastInstr);
                    }
                    return false;
                }
            });

            buttons.on("click", function() {
                var jel = $(this),
                    behavior = jel.data("behavior");

                if (behavior != null) {
                    if (behavior === "bs") {
                        var val = input.val();
                        input.val(val.slice(0, val.length - 1));
                    } else if (behavior === "clear") {
                        input.val("");
                        history.children().not(inputRow).remove();
                    } else if (behavior === "angle-mode") {
                        // TODO(emily): The DEG/RAD should be i18nized at some
                        // point here
                        Calculator.angleMode = Calculator.angleMode === "DEG" ?
                            "RAD" : "DEG";
                        jel.html((Calculator.angleMode === "DEG" ? "<br>" : "") +
                                 Calculator.angleMode);
                    } else if (behavior === "evaluate") {
                        evaluate();
                    }
                } else {
                    var text = jel.data("text") || jel.text();
                    input.val(input.val() + text);
                }

                input.focus();
                return false;
            });

            $(Exercises).on("gotoNextProblem", function() {
                input.val("");
                history.children().not(inputRow).remove();
            });
        };

        initializeCalculator();

        $("#answer_area").delegate("input.button, select", "keydown", function(e) {
            // Don't want to go back to exercise dashboard; just do nothing on backspace
            if (e.keyCode === 8) {
                return false;
            }
        });

        // Prepare for the debug info if requested
        if (localMode && Khan.query.debug != null) {
            $('<div id="debug"></div>').appendTo("#answer_area");
        }

        // Likewise, if we're in browse mode, setup for that
        if (localMode && Khan.query.browse != null) {
            $('<div id="browse"></div>').appendTo("#answer_area");
        }

        $(Khan)
            .bind("updateUserExercise", function(ev, data) {
                // TODO(alpert): Why isn't this in setUserExercise?
                // Any time we update userExercise, check if we're
                // setting/switching usernames
                if (data && data.userExercise) {
                    user = data.userExercise.user || user;
                    userCRC32 = user != null ? KhanUtil.crc32(user) : null;
                    randomSeed = userCRC32 || randomSeed;
                }
            });

        $(Khan).bind("gotoNextProblem", function() {
            if (localMode) {
                // Automatically advance to the next problem
                nextProblem(1);
                renderNextProblem();
            } else {
                // Just listen for the readyForNextProblem event, which will
                // include an updated userExercise (and thus an updated problem
                // number)
            }
        });
    }

    function initEvents() {
        // This function gets called as soon as jQuery is loaded -- on the live
        // site, that's immediately upon execution
        $(Khan)
            .bind("problemTemplateRendered", prepareSite)
            .bind("readyForNextProblem", function(ev, data) {
                renderNextProblem(data);
            })
            .bind("warning", function(ev, data) {
                warn(data.text, data.showClose);
            })
            .bind("upcomingExercise", function(ev, data) {
                var userExercise = data.userExercise;
                startLoadingExercise(
                        userExercise.exercise,
                        userExercise.exerciseModel.displayName,
                        userExercise.exerciseModel.fileName,
                        userExercise.exerciseModel.isQuiz);
            })
            .bind("showHint", function() {
                showHint();
                $(Exercises).trigger("hintShown", {
                    card: Exercises.currentCard
                });
            })
            .bind("refocusSolutionInput", function() {
                // Refocus text field so user can type a new answer
                if (lastFocusedSolutionInput != null) {
                    setTimeout(function() {
                        var focusInput = $(lastFocusedSolutionInput);

                        if (!focusInput.is(":disabled")) {
                            // focus should always work; hopefully select
                            // will work for text fields
                            focusInput.focus();
                            if (focusInput.is("input:text")) {
                                focusInput.select();
                            }
                        }
                    }, 100);
                }
            });
    }

    function deslugify(name) {
        name = name.replace(/_/g, " ");
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    function setProblemNum(num) {
        problemNum = num;
        problemSeed = (seedOffset + jumpNum * (problemNum - 1 + seedsSkipped)) % bins;
        problemBagIndex = (problemNum + problemCount - 1) % problemCount;
    }

    function getSeedsSkippedCacheKey() {
        return "seedsSkipped:" + user + ":" + exerciseName;
    }

    /**
     * Advances the seed (as if the problem number had been advanced) without
     * actually changing the problem number. Caches how many seeds we've skipped
     * so that refreshing does not change the generated problem.
     * @param {number} num Number of times to advance the seed.
     */
    function nextSeed(num) {
        seedsSkipped += num;
        if (typeof LocalStore !== "undefined") {
            LocalStore.set(getSeedsSkippedCacheKey(), seedsSkipped);
        }
        setProblemNum(problemNum);
    }

    function nextProblem(num) {
        setProblemNum(problemNum + num);
    }

    function prevProblem(num) {
        nextProblem(-num);
    }

    function setUserExercise(data) {

        userExercise = data;

        if (data && data.exercise) {
            exerciseId = data.exercise;
        }

        if (user != null) {
            // How far to jump through the problems
            jumpNum = primes[userCRC32 % primes.length];

            // The starting problem of the user
            seedOffset = userCRC32 % bins;

            // The number of seeds that were skipped due to duplicate problems
            seedsSkipped = (typeof LocalStore !== "undefined" &&
                LocalStore.get(getSeedsSkippedCacheKey()) || 0);

            // Advance to the current problem seed
            setProblemNum(userExercise.totalDone + 1);
        }
    }

    /**
     * Load an exercise and return a promise that is resolved when an exercise
     * is loaded
     *
     * @param {Element} exerciseElem HTML element with jQuery data
     * properties name, weight, rootName, and fileName
     */
    function loadExercise(exerciseElem) {
        exerciseElem = $(exerciseElem).detach();
        var id = exerciseElem.data("name");

        var promise = exerciseFilePromises[id];
        if (promise != null) {
            // Already started (or finished) loading this exercise
            return promise;
        } else {
            promise = exerciseFilePromises[id] = $.Deferred();
        }

        var weight = exerciseElem.data("weight");
        var rootName = exerciseElem.data("rootName");
        var fileName = exerciseElem.data("fileName");
        var isQuiz = exerciseElem.data("isQuiz");
        // TODO(eater): remove this once all of the exercises in the datastore
        // have filename properties
        if (fileName == null || fileName == "") {
            fileName = id + ".html";
        }

        // Promises for remote exercises contained within this one
        var subpromises = [];

        // Packing occurs on the server but at the same "exercises/" URL

        // isQuiz is set to true if loading a quiz exercise.
        if (isQuiz && typeof userExercise !== "undefined" && userExercise.readOnly){
            //history mode: load a single problem.
            var pid = userExercise.quizPid;
            var openfile =  "/khan-exercises/exercises/" + id + "/" + pid;           
        }else{
            var openfile = urlBase + "exercises/" + fileName;
        }

        $.get(openfile, function(data, status, xhr) {
            if (!(/success|notmodified/).test(status)) {
                // Maybe loading from a file:// URL?
                Khan.error("Error loading exercise from file " + fileName +
                        xhr.status + " " + xhr.statusText);
                return;
            }

            // Get rid of any external scripts in data before we shove data
            // into a jQuery object. IE8 will attempt to fetch these external
            // scripts otherwise.
            // See https://github.com/Khan/khan-exercises/issues/10957
            data = data.replace(/<script(\s)+src=([^<])*<\/script>/, "");

            var newContents = $(data).filter(".exercise");

            // Name of the top-most ancestor exercise
            newContents.data("rootName", rootName);

            // First, remove ones that refer to other files...
            var remoteExercises = newContents.filter("[data-name]");
            newContents = newContents.not("[data-name]");

            // ...then save the exercise ID, fileName and weights for later
            // TODO(david): Make sure weights work for recursively-loaded
            // exercises.
            newContents.data({
                name: id,
                fileName: fileName,
                weight: weight
            });

            // Add the new exercise elements to the exercises DOM set
            exercises = exercises.add(newContents);

            // Maybe the exercise we just loaded loads some others
            remoteExercises.each(function() {
                subpromises.push(loadExercise(this));
            });

            // Extract data-require
            var match = data.match(
                    /<html(?:[^>]+)data-require=(['"])((?:(?!\1).)*)\1/);
            var requires;
            if (match != null) {
                requires = match[2].length ? match[2].split(" ") : [];
            } else {
                requires = [];
            }

            $.each(requires.concat(Khan.getBaseModules()), function(i, mod) {
                subpromises.push(loadModule(mod));
            });

            // Store the module requirements in exerciseModulesMap
            Khan.exerciseModulesMap[id] = requires;

            // Extract contents from various tags and save them up for parsing
            // when actually showing this particular exercise.
            var tagsToExtract = {
                // TODO(alpert): Do we use title?
                title: /<title>([^<]*(?:(?!<\/title>)<[^<]*)*)<\/title>/gi,

                // Scripts with no src
                script: /<(?:)script\b[^s>]*(?:(?!src=)s[^s>]*)*>([^<]*(?:(?!<\/script>)<[^<]*)*)<\/script>/gi,

                style: /<style[^>]*>([\s\S]*?)<\/style>/gi
            };

            $.each(tagsToExtract, function(tag, regex) {
                var result = [];
                while ((match = regex.exec(data)) != null) {
                    result.push(match[1]);
                }

                newContents.data(tag, result);
            });

            // Wait for any subexercises to load, then resolve the promise
            $.when.apply($, subpromises).then(function() {
                // Success; all subexercises loaded
                promise.resolve();
            }, function() {
                // Failure; some subexercises failed to load
                // TODO(alpert): Find a useful error message
                promise.reject();
            });
        });

        return promise;
    }

    function loadModule(modNameOrObject) {
        var src, deps = [];

        if (typeof modNameOrObject === "string") {
            src = urlBase + "utils/" + modNameOrObject + ".js";
            deps = Khan.moduleDependencies[modNameOrObject] || [];
        } else {
            src = modNameOrObject.src;
        }

        // Return the promise if it exists already
        var selfPromise = modulePromises[src];
        if (selfPromise) {
            return selfPromise;
        } else {
            selfPromise = $.Deferred();
        }

        var depsPromises = [];

        // Load the dependencies
        $.each(deps, function(i, dep) {
            depsPromises.push(loadModule(dep));
        });

        // Load the module once all of the dependencies have been loaded
        $.when.apply($, depsPromises).then(function() {
            Khan.loadScript(src, function() {
                selfPromise.resolve();
            });
        });

        modulePromises[src] = selfPromise;
        return selfPromise;
    }

    function loadTestModeSite() {
        // TODO(alpert): Is the DOM really not yet ready?
        $(function() {
            // Inject the site markup
            if (localMode) {
                $.get(urlBase + "exercises/khan-site.html", function(site) {
                    $.get(urlBase + "exercises/khan-exercise.html",
                        function(ex) {
                            injectTestModeSite(site, ex);
                        });
                });
            }
        });
    }

    function injectTestModeSite(html, htmlExercise) {
        $("body").prepend(html);
        $("#container .exercises-header h2").append(document.title);
        $("#container .exercises-body .current-card-contents").html(
                htmlExercise);

        if (Khan.query.layout === "lite") {
            $("html").addClass("lite");
        }

        $(Exercises).trigger("problemTemplateRendered");

        exercises = exercises.add($("div.exercise").detach());
        var problems = exercises.children(".problems").children();

        // Don't make the problem bag when a specific problem is specified
        // because it messes up problem permalinks (because makeProblemBag
        // calls KhanUtil.random() and changes the seed)
        if (Khan.query.problem == null) {
            weighExercises(problems);
            problemBag = makeProblemBag(problems, 10);
        }

        // Generate the initial problem when dependencies are done being loaded
        makeProblem();
    }

    return Khan;

})();

function fixLabel(){
    $(".imageLabel").each(function(){
        var align = $(this).attr("alignType");
        var labelSpan = $("span:first",this); 
        var fixWidth;
        var fixHeight;
        if(align == "center"){
           fixWidth = labelSpan.width() / 2;
           fixHeight = labelSpan.height() / 2;
        }
        else if(align == "above"){ 
           fixWidth = labelSpan.width() / 2; 
           fixHeight = labelSpan.height();
        } 
        else if(align == "above right"){
           fixWidth = 0;
           fixHeight = labelSpan.height();
        } 
        else if(align == "right"){
           fixWidth = 0;
           fixHeight = labelSpan.height() / 2;
        } 
        else if(align == "below right"){
           fixWidth = 0;
           fixHeight = 0;
        }
        else if(align == "below"){
           fixWidth = labelSpan.width() / 2;
           fixHeight = 0;
        } 
        else if(align == "below left"){
           fixWidth = labelSpan.width();
           fixHeight = 0;
        } 
        else if(align == "left"){
           fixWidth = labelSpan.width();
           fixHeight = labelSpan.height() / 2;
        } 
        else if(align == "above left"){
           fixWidth = labelSpan.width();
           fixHeight = labelSpan.height();
        } 
        else{}

        var oriLeft = parseInt($(this).css("left"));
        var oriTop = parseInt($(this).css("top"));
        $(this).css('left', oriLeft - fixWidth ); 
        $(this).css('top', oriTop - fixHeight);
        
    });
}

// Make this publicly accessible
var KhanUtil = Khan.Util;
