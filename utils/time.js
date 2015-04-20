$.extend(KhanUtil, {

    addAnalogClock: function(options) {

        var analogClock = $.extend(true, {
            graph: KhanUtil.currentGraph,
            set: KhanUtil.currentGraph.raphael.set(),
            radius: 3.5,
            showLabels: true,
            hour: false,
            minute: false,
            hourTicks: 12,
            minuteTicks: 48,
            hourTickLength: 0.8, // make this more understandable
            minuteTickLength: 0.95
        }, options);

        analogClock.drawTicks = function(options) {
            var n = options.n;
            var p = options.p;
            var x, y, outerPoint, innerPoint;

            for (var i = 0; i < n; i++) {
                x = this.radius * Math.cos(2 * Math.PI * i / n);
                y = this.radius * Math.sin(2 * Math.PI * i / n);
                outerPoint = [x, y];
                innerPoint = [p * x, p * y];
                var line = this.graph.line(outerPoint, innerPoint);
                if (options.tickAttr) {
                    line.attr(options.tickAttr);
                }
                this.set.push(line);
            }
        };

        analogClock.drawLabels = function() {
            for (var i = 1; i < 13; i++) {
                this.set.push(this.graph.label([0.7 * this.radius * Math.sin(2 * Math.PI * i / 12), 0.7 * this.radius * Math.cos(2 * Math.PI * i / 12)], i));
            }
            return this.set;
        };

        analogClock.drawHands = function() {
            this.set.push(this.graph.line([0.4 * this.radius * Math.sin(2 * Math.PI * this.hour / 12 + (this.minute / 60) / 12 * 2 * Math.PI), 0.4 * this.radius * Math.cos(2 * Math.PI * this.hour / 12 + (this.minute / 60) / 12 * 2 * Math.PI)], [0, 0],{"stroke-width": 3 ,stroke : KhanUtil.GREEN}));
            this.set.push(this.graph.line([0.6 * this.radius * Math.sin((this.minute / 60) * 2 * Math.PI), 0.6 * this.radius * Math.cos((this.minute / 60) * 2 * Math.PI)], [0, 0],{"stroke-width": 3 ,stroke : KhanUtil.ORANGE}));
        };

        analogClock.draw = function() {
            if (this.hourTicks) {
                this.drawTicks({n: this.hourTicks, p: this.hourTickLength});
            }
            if (this.minuteTicks) {
                this.drawTicks({n: this.minuteTicks, p: this.minuteTickLength});
            }
            // draw circles
            this.set.push(this.graph.circle([0, 0], this.radius));
            this.set.push(this.graph.circle([0, 0], this.radius / 40));
            if (this.showLabels) {
                this.drawLabels();
            }
            if (this.hour !== false && this.minute !== false) {
                this.drawHands();
            }
            return this.set;
        };

        return analogClock;
    },

    /* Map time in minutes to angle in degrees
     * - Minutes start at positive y-axis and increase clockwise
     * - Angle starts at positive x-axis and increases counterclockwise
     * - (e.g., 0 minutes => 90 degrees; 15 minutes => 0 degrees; 30 minutes => 270 degrees; 45 minutes => 180 degrees)
     * - Will return angle in radians if `angleInRadians` is specified as truthy.
     */
    timeToDegrees: function(minutes, angleInRadians) {
        // p is the proportion of total time
        var p = minutes / 60;
        var angleProportion;

        if (p <= 0.25) {
            angleProportion = (0.25 - p);
        } else {
            angleProportion = (1.25 - p);
        }

        if (angleInRadians) {
            return 2 * Math.PI * angleProportion;
        }
        return 360 * angleProportion;
    },
	
	/* 返回一個平分成 100 份的圓
	*/
	addAnalogCircle: function(options) {

        var analogCircle = $.extend(true, {
            graph: KhanUtil.currentGraph,
            set: KhanUtil.currentGraph.raphael.set(),
            radius: 3.5,
            showLabels: false,
            hour: false,
            minute: false,
            hourTicks: 10,
            minuteTicks: 1,
			middleTicks: 20,
            hourTickLength: 0.85, // make this more understandable
            minuteTickLength: 0.95,
			middleTickLength: 0.9
        }, options);

        analogCircle.drawTicks = function(options) {
            var n = options.n;
            var p = options.p;
            var x, y, outerPoint, innerPoint;

            for (var i = 0; i < n; i++) {
                x = this.radius * Math.cos(2 * Math.PI * i / n);
                y = this.radius * Math.sin(2 * Math.PI * i / n);
                outerPoint = [x, y];
                innerPoint = [p * x, p * y];
                var line = this.graph.line(outerPoint, innerPoint);
                if (options.tickAttr) {
                    line.attr(options.tickAttr);
                }
                this.set.push(line);
            }
        };

        analogCircle.draw = function() {
            if (this.hourTicks) {
                this.drawTicks({n: this.hourTicks, p: this.hourTickLength});
            }
            if (this.minuteTicks) {
                this.drawTicks({n: this.minuteTicks, p: this.minuteTickLength});
            }
			if (this.middleTicks) {
                this.drawTicks({n: this.middleTicks, p: this.middleTickLength});
            }
            // draw circles
            this.set.push(this.graph.circle([0, 0], this.radius));
            this.set.push(this.graph.circle([0, 0], this.radius / 40));
            return this.set;
        };

        return analogCircle;
    },

});
