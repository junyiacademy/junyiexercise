// Example usage:
// <var>person(1)</var> traveled 5 mi by <var>vehicle(1)</var>. Let
// <var>his(1)</var> average speed be <var>personVar(1)</var>.
// Let <var>person(2)</var>'s speed be <var>personVar(2)</var>.
//
// Note that initials (-Var) are guaranteed to be unique in each category,
// but not across them.

$.extend(KhanUtil, {
    toSentence: function(array, conjunction) {
        if (conjunction == null) {
            conjunction = "和";
        }

        if (array.length === 0) {
            return "";
        } else if (array.length === 1) {
            return array[0];
        } else if (array.length === 2) {
            return array[0] + " " + conjunction + " " + array[1];
        } else {
            return array.slice(0, -1).join(", ") + ", " + conjunction + " " + array[array.length - 1];
        }
    },

    toSentenceTex: function(array, conjunction, highlight, highlightClass) {
        var wrapped = $.map(array, function(elem) {
            if (($.isFunction(highlight) && highlight(elem)) || (highlight !== undefined && elem === highlight)) {
                return "<code class='" + highlightClass + "'>" + elem + "</code>";
            }
            return "<code>" + elem + "</code>";
        });
        return KhanUtil.toSentence(wrapped, conjunction);
    },

    capitalize: function(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    // pluralization helper.  There are five signatures
    // - plural(NUMBER): return "s" if NUMBER is not 1
    // - plural(NUMBER, singular):
    //        - if necessary, magically pluralize <singular>
    //        - return "NUMBER word"
    // - plural(NUMBER, singular, plural):
    //        - return "NUMBER word"
    // - plural(singular, NUMBER):
    //        - if necessary, magically pluralize <singular>
    //        - return "word"
    // - plural(singular, plural, NUMBER):
    //        - return "word"
    plural: (function() {
        var oneOffs = {
            "quiz測驗": "quizzes測驗", //（sjf：可以翻成“小考”）
            "shelf架子": "shelves架子", //（sjf：“書架”）
            "loaf麵包": "loaves麵包",
            "potato馬鈴薯": "potatoes馬鈴薯",
            "person人": "people人",
            "is是": "are是",
            "was是": "were是",
            "foot腳": "feet腳", //（可以有兩個意思：腳、英尺。不知道實際上用哪一個？）
            "square foot平方公尺": "square feet平方公尺",
            "tomato番茄": "tomatoes番茄"
        };

        var pluralizeWord = function(word) {

            // noone really needs extra spaces at the edges, do they?
            word = $.trim(word);

            // determine if our word is all caps.  If so, we'll need to
            // re-capitalize at the end
            var isUpperCase = (word.toUpperCase() === word);
            var oneOff = oneOffs[word.toLowerCase()];
            var words = word.split(/\s+/);

            // first handle simple one-offs
            // ({}).watch is a function in Firefox, blargh
            if (typeof oneOff === "string") {
                return oneOff;
            }

            // multiple words
            else if (words.length > 1) {
                // for 3-word phrases where the middle word is 'in' or 'of',
                // pluralize the first word
                if (words.length === 3 && /\b(in|of)\b/i.test(words[1])) {
                    words[0] = KhanUtil.plural(words[0]);
                }

                // otherwise, just pluraize the last word
                else {
                    words[words.length - 1] =
                        KhanUtil.plural(words[words.length - 1]);
                }

                return words.join(" ");
            }

            // single words
            else {
                // "-y" => "-ies"
                if (/[^aeiou]y$/i.test(word)) {
                    word = word.replace(/y$/i, ""); //"ies"
                }

                // add "es"; things like "fish" => "fishes"
                else if (/[sxz]$/i.test(word) || /[bcfhjlmnqsvwxyz]h$/.test(word)) {
                    word += ""; //"es"
                }

                // all the rest, just add "s"
                else {
                    word += ""; //"s"
                }

                if (isUpperCase) {
                    word = word.toUpperCase();
                }
                return word;
            }
        };

        return function(value, arg1, arg2) {
            if (typeof value === "number") {
                var usePlural = (value !== 1);

                // if no extra args, just add "s" (if plural)
                if (arguments.length === 1) {
                    return usePlural ? "" : ""; //"s" : ""
                }

                if (usePlural) {
                    arg1 = arg2 || pluralizeWord(arg1);
                }

                return value + " " + arg1;
            } else if (typeof value === "string" || typeof value === "object") {
                var plural = pluralizeWord(value);
                if ((typeof arg1 === "string" || typeof arg1 === "object") && arguments.length === 3) {
                    plural = arg1;
                    arg1 = arg2;
                }
                var usePlural = (arguments.length < 2 || (typeof arg1 === "number" && arg1 !== 1));
                return usePlural ? plural.toString() : value.toString();
            }
        };
    })()
});

$.fn["word-problemsLoad"] = function() {

    var IncrementalShuffler = function(array) {
        // Shuffle an array incrementally so we only use as many random calls
        // as we need, so names can be added/removed without breaking all
        // random seeds for all word problems
        // - get(0); get(0); will use only one call
        // - get(0); get(1); will have each use one random call
        // - get(1); get(0); will use two random calls then none and each call
        //   will give the same result as running 0 then 1
        array = [].slice.call(array, 0);
        var shuffled = 0;

        this.get = function(i) {
            if (i < 0 || i >= array.length) {
                return undefined;
            }

            while (shuffled <= i) {
                var top = array.length - shuffled,
                    newEnd = Math.floor(KhanUtil.random() * top),
                    tmp = array[newEnd];

                array[newEnd] = array[top - 1];
                array[top - 1] = tmp;
                shuffled++;
            }

            // Since we shuffle items from the end to the front, return the
            // items in reverse order
            return array[array.length - i - 1];
        };
    };
    
    var Noun = function(noun, properties) {
    	// extend noun with some properties
    	// new Noun("", {measureWord: new IncrementalShuffler(["", ""])})
    	var nounObject = new String(noun);
    	if (typeof properties === "object") {
    		// extend properties, but restricted to known properties, e.g.: measureWord
    		if (properties["measureWord"]) {
    			nounObject["measureWord"] = properties["measureWord"];
    		}
    	}
    	return nounObject;
    };

    var names = [
        ["玉婷", "f"],
        ["小明", "m"], 
        ["志明", "m"], 
        ["俊杰", "m"], 
        ["天佑", "m"], 
        ["秀英", "f"], 
        ["怡君", "f"], 
        ["哲浩", "m"], 
        ["佳玲", "f"], 
        ["才良", "m"],  
        ["冠宇", "m"],  
        ["文山", "m"],   
        ["淑芬", "f"],  
        ["成文", "m"],  
		["力學", "m"],   
        ["惠如", "f"],  
        ["心怡", "f"], 
        ["佩珍", "f"],  
        ["小惠", "f"],  
        ["正雄", "m"]  
    ];

    // We only want one name per letter of the alphabet, so group people with
    // the same initial before shuffling the names up
    var people = _.map(_.groupBy(names, function(name) {
        return name[0].charAt(0);
    }), function(group) {
        return new IncrementalShuffler(group);
    });
    people = new IncrementalShuffler(people);

    var vehicles = new IncrementalShuffler([
        new Noun("腳踏車", {measureWord: new IncrementalShuffler(["台", "輛"])}),
        new Noun("汽車", {measureWord: new IncrementalShuffler(["台", "輛"])}),
        new Noun("馬", {measureWord: "隻"}),
        new Noun("機車", {measureWord: new IncrementalShuffler(["台", "輛"])}),
        new Noun("火車", {measureWord: new IncrementalShuffler(["台", "輛", "班"])})
    ]);

    var courses = new IncrementalShuffler([
        new Noun("代數", {measureWord: new IncrementalShuffler(["堂", "節"])}),
        new Noun("化學", {measureWord: new IncrementalShuffler(["堂", "節"])}),
        new Noun("幾何學", {measureWord: new IncrementalShuffler(["堂", "節"])}),
        new Noun("歷史", {measureWord: new IncrementalShuffler(["堂", "節"])}),
        new Noun("物理", {measureWord: new IncrementalShuffler(["堂", "節"])}),
        new Noun("英文", {measureWord: new IncrementalShuffler(["堂", "節"])})
    ]);

    var exams = new IncrementalShuffler([
        new Noun("考試", {measureWord: "次"}), //（期末考）
        new Noun("考試", {measureWord: "次"}), //（月考）
        new Noun("測驗", {measureWord: "次"}) //（小考）
    ]);

    var binops = new IncrementalShuffler([
        "\\barwedge",
        "\\veebar",
        "\\odot",
        "\\oplus",
        "\\otimes",
        "\\oslash",
        "\\circledcirc",
        "\\boxdot",
        "\\bigtriangleup",
        "\\bigtriangledown",
        "\\dagger",
        "\\diamond",
        "\\star",
        "\\triangleleft",
        "\\triangleright"
    ]);

    var collections = new IncrementalShuffler([
        ["椅子", "排", "make做"], //（Make很多意思，不曉得在英文裡怎麼用？）
        ["彈珠", "袋", "fill裝滿"],
        ["軟糖", "堆", "make做"],
        ["書", "書架", "fill裝滿"],
        ["資料夾", "疊", "fill裝滿"],
        ["餅乾", "盒", "fill裝滿"]
    ]);

    var stores = new IncrementalShuffler([
        {
            name: "文具",
            items: new IncrementalShuffler([
                                            new Noun("原子筆", {measureWord: "枝"}),
                                            new Noun("立可白", {measureWord: "罐"}),
                                            new Noun("鉛筆", {measureWord: "枝"}),
                                            new Noun("筆記本", {measureWord: "本"}),
											new Noun("夾子", {measureWord: "個"}),
											new Noun("蠟筆", {measureWord: "枝"}),
											new Noun("橡皮擦", {measureWord: new IncrementalShuffler(["個", "塊"])}),
											new Noun("資料夾", {measureWord: "個"}),
											new Noun("膠水", {measureWord: new IncrementalShuffler(["瓶", "罐"])}),
											new Noun("簽字筆", {measureWord: "枝"}),
											new Noun("印章", {measureWord: "個"})									
                                            ])
        },
        {
            name: "五金器材",
            items: new IncrementalShuffler([
                                            new Noun("鐵鎚", {measureWord: new IncrementalShuffler(["把", "支", "只"])}),
                                            new Noun("水桶", {measureWord: new IncrementalShuffler(["個", "只"])}),
                                            new Noun("釘子", {measureWord: new IncrementalShuffler(["枝", "支"])}),
                                            new Noun("鋸子", {measureWord: new IncrementalShuffler(["把", "支"])})
                                            ])
        },
        {
            name: "食品",
            items: new IncrementalShuffler([
                                            new Noun("香蕉", {measureWord: new IncrementalShuffler(["根", "個"])}),
                                            new Noun("三明治", {measureWord: new IncrementalShuffler(["塊", "個"])}),
                                            new Noun("冰棒", {measureWord: new IncrementalShuffler(["根", "枝"])}),
                                            new Noun("蕃薯", {measureWord: new IncrementalShuffler(["顆", "個"])}),
                                            new Noun("麵包", {measureWord: new IncrementalShuffler(["塊", "個"])}),
                                            new Noun("牛奶", {measureWord: new IncrementalShuffler(["瓶", "罐"])}),
                                            new Noun("馬鈴薯", {measureWord: new IncrementalShuffler(["顆", "個"])})
                                            ]) //（一條麵包，一加侖牛奶？）
        },
        {
            name: "禮品",
            items: new IncrementalShuffler([
                                            new Noun("玩具", {measureWord: new IncrementalShuffler(["盒", "個"])}),
                                            new Noun("遊戲", {measureWord: new IncrementalShuffler(["盒", "個"])}),
                                            new Noun("紀念品", {measureWord: "個"})
                                            ])
        },
        {
            name: "玩具",
            items: new IncrementalShuffler([
                                            new Noun("泰迪熊", {measureWord: new IncrementalShuffler(["隻", "個"])}),
                                            new Noun("電動玩具", {measureWord: "個"}),
                                            new Noun("魔術方塊", {measureWord: "個"}),
                                            new Noun("賽車", {measureWord: new IncrementalShuffler(["台", "個", "輛"])}),
                                            new Noun("洋娃娃", {measureWord: "個"})
                                            ])
        }
    ]);

    var pizzas = new IncrementalShuffler([
        new Noun("比薩", {measureWord: new IncrementalShuffler(["塊", "片", "個"])}),
        new Noun("派", {measureWord: new IncrementalShuffler(["塊", "片", "個"])}),
        new Noun("蛋糕", {measureWord: new IncrementalShuffler(["塊", "片", "個"])})
    ]);

    var timesofday = new IncrementalShuffler([
        "上午",
        "中午",
        "傍晚",
        "晚上"
    ]);

    var exercises = new IncrementalShuffler([
        new Noun("伏地挺身", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("仰臥起坐", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("開合跳", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("原地彈跳", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("交互蹲跳", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("跳跳繩", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("呼拉圈轉", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("踢毽子", {measureWord: new IncrementalShuffler(["個", "次", "下"])}),
        new Noun("投籃", {measureWord: new IncrementalShuffler(["個", "次", "下"])})
    ]);

    var fruits = new IncrementalShuffler([
        new Noun("蘋果", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("梨子", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("椰子", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("茄子", {measureWord: new IncrementalShuffler(["個", "條"])}),
        new Noun("奇異果", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("檸檬", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("芒果", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("桃子", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("橘子", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("芭樂", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])}),
        new Noun("西瓜", {measureWord: new IncrementalShuffler(["個", "粒", "顆"])})
    ]);

    var deskItems = new IncrementalShuffler([
        new Noun("夾子", {measureWord: "個"}),
        new Noun("蠟筆", {measureWord: "枝"}),
        new Noun("橡皮擦", {measureWord: new IncrementalShuffler(["個", "塊"])}),
        new Noun("資料夾", {measureWord: "個"}),
        new Noun("膠水", {measureWord: new IncrementalShuffler(["瓶", "罐"])}),
        new Noun("簽字筆", {measureWord: "枝"}),
        new Noun("筆記本", {measureWord: "本"}),
        new Noun("鉛筆", {measureWord: "枝"}),
        new Noun("印章", {measureWord: "個"})
    ]);

    var colors = new IncrementalShuffler([
        "紅色",
        "橘色",
        "黃色",
        "綠色",
        "藍色",
        "紫色",
        "白色",
        "黑色",
        "褐色",
        "銀色",
        "金色",
        "粉紅色"
    ]);
    
	var movies = new IncrementalShuffler([
	       "綠野仙蹤",
		   "玩具總動員",
		   "米老鼠",
		   "黑天鵝",
		   "小美人魚",
		   "灰姑娘",
		   "獅子王",
		   "花木蘭",
		   "小熊維尼",
    ]);
	
	var familys = new IncrementalShuffler([
	       "爸爸",
		   "媽媽",
		   "爺爺",
		   "奶奶",
		   "外公",
		   "外婆",
		   "哥哥",
		   "姊姊",
		   "弟弟",
		   "妹妹",
		   "阿姨",
		   "姑姑",
    ]);
	
	var countrys = new IncrementalShuffler([
	       "宜蘭縣",
		   "花蓮縣",
		   "台東縣",
		   "雲林縣",
		   "嘉義縣",
		   "屏東縣",
		   "苗栗縣",
		   "彰化縣"
    ]);
	
    var schools = new IncrementalShuffler([
        "龍埔國小",
        "長安國小",
        "米倉國小",
        "育英國小",
        "康橋國小",
        "中山國中",
        "潛龍國小",
        "仁和國小",
        "南崁國小",
        "羅娜國小",
        "東埔國小",
        "嘉北國小",
        "大成國中",
        "仁德國小",
        "五甲國中",
        "加昌國小",
        "龍肚國小",
        "港東國小",
        "礁溪國中",
        "湖山國小",
        "吳江國小",
        "瑞穗國中",
        "桃源國小",
        "均一中小學",
        "武陵國小"
    ]);

    var furnitureStore = new IncrementalShuffler([
        new Noun("椅子", {measureWord: "張"}),
        new Noun("茶几", {measureWord: "張"}),
        new Noun("床",   {measureWord: "張"}),
        new Noun("沙發", {measureWord: "張"}),
        new Noun("躺椅", {measureWord: "張"}),
        new Noun("書桌", {measureWord: "個"}),
        new Noun("書架", {measureWord: "個"})
    ]);

    var electronicStore = new IncrementalShuffler([
        new Noun("電視", {measureWord: "台"}), 
        new Noun("電腦", {measureWord: "台"}),
        new Noun("筆電", {measureWord: "台"}),
        new Noun("數位相機", {measureWord: "台"})
    ]);

    var clothes = new IncrementalShuffler([
        new Noun("帽子", {measureWord: "頂"}),
        new Noun("褲子", {measureWord: new IncrementalShuffler(["件", "條"])}),
        new Noun("皮帶", {measureWord: "條"}),
        new Noun("項鍊", {measureWord: "條"}),
        new Noun("皮包", {measureWord: "個"}),
        new Noun("鞋子", {measureWord: "雙"}),
        new Noun("襯衫", {measureWord: "件"}),
        new Noun("裙子", {measureWord: new IncrementalShuffler(["件", "條"])}),
        new Noun("手錶", {measureWord: new IncrementalShuffler(["只", "個"])}),
        new Noun("襪子", {measureWord: "雙"}),
        new Noun("毛衣", {measureWord: "件"}),
        new Noun("領帶", {measureWord: "條"}),
        new Noun("洋裝", {measureWord: new IncrementalShuffler(["件", "套"])})
    ]);

    var sides = new IncrementalShuffler([
        "左",
        "右"
    ]);

    var shirtStyles = new IncrementalShuffler([
        "長袖",
        "短袖"
    ]);

    // animal, avg-lifespan, stddev-lifespan
    // (data is from cursory google searches and wild guessing)
    var animals = new IncrementalShuffler([
        ["鱷魚", 68, 20],
        ["食蟻獸", 15, 10],
        ["熊", 40, 20],
        ["大象", 60, 10],
        ["大猩猩", 20, 5],
        ["獅子", 12, 5],
        ["蜥蜴", 3, 1],
        ["羚羊", 13, 5],
        ["豪豬", 20, 5], //（山豬）
        ["海豹", 15, 10],
        ["猴子", 16, 5],
        ["蛇", 25, 10],
        ["老虎", 22, 5],
        ["烏龜", 100, 20],
        ["斑馬", 25, 10]
    ]);

    var farmers = new IncrementalShuffler([
        {farmer: "農夫", crops: new IncrementalShuffler([
                                                       new Noun("番茄", {measureWord: new IncrementalShuffler(["棵", "顆", "粒", "個", "株"])}),
                                                       new Noun("馬鈴薯", {measureWord: new IncrementalShuffler(["棵", "顆", "粒", "個", "株"])}),
                                                       new Noun("胡蘿蔔", {measureWord: new IncrementalShuffler(["棵", "顆", "粒", "個", "株"])}),
                                                       new Noun("豆子", {measureWord: new IncrementalShuffler(["棵", "顆", "粒", "個", "株"])}),
                                                       new Noun("稻子", {measureWord: new IncrementalShuffler(["棵", "顆", "粒", "個", "株"])})
                                                       ]), field: "農地"},
        {farmer: "園丁", crops: new IncrementalShuffler([
                                                       new Noun("玫瑰花", {measureWord: new IncrementalShuffler(["朵", "枝", "株"])}),
                                                       new Noun("鬱金香", {measureWord: new IncrementalShuffler(["朵", "枝", "株"])}),
                                                       new Noun("菊花", {measureWord: new IncrementalShuffler(["朵", "枝", "株"])}),
                                                       new Noun("向日葵", {measureWord: new IncrementalShuffler(["朵", "枝", "株"])}),
                                                       new Noun("百合花", {measureWord: new IncrementalShuffler(["朵", "枝", "株"])})
                                                       ]), field: "花園"}
    ]);

    var distances = new IncrementalShuffler([
        "公尺",
        "公里"
    ]);

    var distanceActivities = new IncrementalShuffler([
        {present: "騎", past: "騎", noun: new Noun("腳踏車", {measureWord: new IncrementalShuffler(["台", "輛"])}), done: "騎", continuous: "騎"}, //（這幾個都很難翻。騎過、正在騎？怪怪的）
        {present: "划", past: "划", noun: new Noun("船", {measureWord: "艘"}), done: "划", continuous: "划"},
        {present: "遛", past: "遛", noun: new Noun("狗", {measureWord: "隻"}), done: "遛", continuous: "遛"}
    ]);

    var indefiniteArticle = function(word) {
        var vowels = ["a", "e", "i", "o", "u"];
        if (_(vowels).indexOf(word[0].toLowerCase()) > -1) {
            return "An " + word;
        }
        return "A " + word;
    };

    $.extend(KhanUtil, {
        person: function(i) {
            return people.get(i - 1).get(0)[0];
        },

        personVar: function(i) {
            return people.get(i - 1).get(0)[0].charAt(0).toLowerCase();
        },

        he: function(i) {
            return people.get(i - 1).get(0)[1] === "m" ? "他" : "她";
        },

        He: function(i) {
            return people.get(i - 1).get(0)[1] === "m" ? "他" : "她";
        },

        him: function(i) {
            return people.get(i - 1).get(0)[1] === "m" ? "他" : "她";
        },

        his: function(i) {
            return people.get(i - 1).get(0)[1] === "m" ? "他的" : "她的"; //（him、her似乎還是翻成他、她）
        },

        His: function(i) {
            return people.get(i - 1).get(0)[1] === "m" ? "他的" : "她的";
        },

        An: function(word) {
            return indefiniteArticle(word);
        },

        an: function(word) {
            return indefiniteArticle(word).toLowerCase();
        },

        vehicle: function(i) {
            return vehicles.get(i - 1);
        },

        vehicleVar: function(i) {
            return vehicles.get(i - 1).charAt(0);
        },

        course: function(i) {
            return courses.get(i - 1);
        },

        courseVar: function(i) {
            return courses.get(i - 1).charAt(0).toLowerCase();
        },

        exam: function(i) {
            return exams.get(i - 1);
        },

        binop: function(i) {
            return binops.get(i - 1);
        },

        item: function(i) {
            return collections.get(i - 1)[0];
        },

        group: function(i) {
            return collections.get(i - 1)[1];
        },

        groupVerb: function(i) {
            return collections.get(i - 1)[2];
        },

        store: function(i) {
            return stores.get(i).name;
        },

        storeItem: function(i, j) {
            return stores.get(i).items.get(j);
        },

        pizza: function(i) {
            return pizzas.get(i);
        },

        exercise: function(i) {
            return exercises.get(i - 1);
        },

        timeofday: function(i) {
            return timesofday.get(i - 1);
        },

        school: function(i) {
            return schools.get(i - 1);
        },

        clothing: function(i) {
            return clothes.get(i - 1);
        },

        color: function(i) {
            return colors.get(i - 1);
        },
		
	    movie: function(i) {
		    return movies.get(i-1);
	    },
		
		family: function(i) {
		    return familys.get(i-1);
	    },
		
		country: function(i) {
		    return countrys.get(i-1);
	    },

        fruit: function(i) {
            return fruits.get(i);
        },

        deskItem: function(i) {
            return deskItems.get(i);
        },

        distance: function(i) {
            return distances.get(i - 1);
        },

        rode: function(i) {
            return distanceActivities.get(i - 1).past;
        },

        ride: function(i) {
            return distanceActivities.get(i - 1).present;
        },

        bike: function(i) {
            return distanceActivities.get(i - 1).noun;
        },

        biked: function(i) {
            return distanceActivities.get(i - 1).done;
        },

        biking: function(i) {
            return distanceActivities.get(i - 1).continuous;
        },

        farmer: function(i) {
            return farmers.get(i - 1).farmer;
        },

        crop: function(i) {
            return farmers.get(i - 1).crops.get(0);
        },

        field: function(i) {
            return farmers.get(i - 1).field;
        },

        side: function(i) {
            return sides.get(i - 1);
        },

        shirtStyle: function(i) {
            return shirtStyles.get(i - 1);
        },

        furniture: function(i) {
            return furnitureStore.get(i - 1);
        },

        electronic: function(i) {
            return electronicStore.get(i - 1);
        },

        animal: function(i) {
            return animals.get(i - 1)[0];
        },

        animalAvgLifespan: function(i) {
            return animals.get(i - 1)[1];
        },

        animalStddevLifespan: function(i) {
            return animals.get(i - 1)[2];
        },
        
        // measure word helper.(for Chinese)  There are two signatures
        // - measureWord(NOUN): return measure word of NOUN if available
        // - measureWord(NUMBER, NOUN): return "NUMBER measureWord NOUN", use default measure word if not available
        measureWord: function measureWord(value, arg1) {
        	// get measure word of noun if available
        	var getMeasureWord = function(noun) {
        		// return empty string if noun is just null or undefined
        		if (!noun) {
        			return "";
        		}
        		
            	if (typeof noun.measureWord === "string") {
                	return noun.measureWord;
            	} else if (typeof noun.measureWord === "object" && noun.measureWord.get){
            		return noun.measureWord.get(0);
            	}
            	
            	// return empty string if no match
        		return "";
        	};
        	
        	if (typeof value === "number") {
        		return arg1 ? value + " " + getMeasureWord(arg1) + arg1 : value.toString();
        	} else {
        		return getMeasureWord(value);
        	}
        }
    });
};
