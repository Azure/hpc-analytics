/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    "use strict";
    export class Visual implements IVisual {
        private host: IVisualHost;
        private svg: d3.Selection<SVGAElement>;
        private container: d3.Selection<SVGAElement>;
        private segments: d3.Selection<SVGAElement>[];
        private baseLines: d3.Selection<SVGAElement>[];
        private labels: d3.Selection<SVGAElement>[];

        private dateTextCursors: number[];

        constructor(options: VisualConstructorOptions) {
            this.svg = d3.select(options.element).append('svg').classed('myVisual', true);
            this.container = this.svg.append("g").classed('container', true);
            this.segments = [];
            this.baseLines = [];
            this.labels = [];
            this.dateTextCursors = [];
        }

        private addDateText(x, y, timeMs) {
            let dateTextWidth: number = 60;
            let conflict: boolean = false;
            for (let cursor of this.dateTextCursors) {
                if (Math.abs(cursor - x) < dateTextWidth) {
                    conflict = true;
                    break;
                }
            }
            if (conflict)
                return;

            let dateTime: Date = new Date(timeMs);
            let dateString: string = String(dateTime.getMonth() + 1) + "/" + 
                                     String(dateTime.getDate()) + "/" + 
                                     String(dateTime.getFullYear());
            let hours: number = dateTime.getHours();
            let minutes: number = dateTime.getMinutes();
            let seconds: number = dateTime.getSeconds();
            let timeString: string = "";
            timeString += (hours < 10 ? "0" : "") + String(hours);
            timeString += (minutes < 10 ? ":0" : ":") + String(minutes);
            timeString += (seconds < 10 ? ":0" : ":") + String(seconds);
            let date: d3.Selection<SVGAElement> = this.container.append("text").classed("text", true);
            date.text(dateString)
                .attr({
                    x: x,
                    y: y,
                    dy: "0.4em",
                    "text-anchor": "middle",
                    "dominant-baseline": "hanging"
                })
                .style("font-size", "11px")
                .style("fill", "Gray");
            this.labels.push(date);
            let time: d3.Selection<SVGAElement> = this.container.append("text").classed("text", true);
            time.text(timeString)
                .attr({
                    x: x,
                    y: y,
                    dy: "1.4em",
                    "text-anchor": "middle",
                    "dominant-baseline": "hanging"
                })
                .style("font-size", "11px")
                .style("fill", "Gray");
            this.labels.push(time);
            this.dateTextCursors.push(x);
        }

        public update(options: VisualUpdateOptions) {
            let dataView: DataView = options.dataViews[0];
            let textSize: string = "11px";
            let textColor: string = "Gray";
            let width: number = options.viewport.width;
            let height: number = options.viewport.height;
            let marginL: number = 30;
            let marginR: number = 30;
            let marginT: number = 30;
            let marginB: number = 30;
            let rangeX: number = width - marginL - marginR;
            let rangeY: number = height - marginT - marginB;

            this.svg.attr({
                width: width,
                height: height
            });

            for (let segment of this.segments)
                segment.remove();
            this.segments = [];
            for (let line of this.baseLines)
                line.remove();
            this.baseLines = [];
            for (let label of this.labels) 
                label.remove();
            this.labels = [];
            this.dateTextCursors = [];

            let rows: number[][] = dataView.table.rows as number[][];

            let minX: number = rows[0][0];
            let maxX: number = rows[rows.length - 1][0];
            let maxUsage: number = 0;
            for (let row of rows) {
                maxUsage = Math.max(row[2], row[3], maxUsage);
            }
            let step: number = 8;
            let rectWidth: number = 8;

            let shares: number = Math.floor(maxUsage / step);
            for (let i = 0; i < shares + 1; i++) {
                let lineX: d3.Selection<SVGAElement> = this.container.append("line").classed("line", true);
                lineX.attr("x1", marginL - 10)
                    .attr("y1", marginT + rangeY * (maxUsage - step * i) / maxUsage)
                    .attr("x2", marginL + rangeX + 10)
                    .attr("y2", marginT + rangeY * (maxUsage - step * i) / maxUsage)
                    .attr("stroke-width", 1.5)
                    .attr("stroke", "LightGray");
                this.baseLines.push(lineX);
                let label: d3.Selection<SVGAElement> = this.container.append("text").classed("text", true);
                label.text(String(step * i))
                    .attr({
                        x: marginL - 10,
                        y: marginT + rangeY * (maxUsage - step * i) / maxUsage,
                        dx: "-0.4em",
                        "text-anchor": "end",
                        "dominant-baseline": "central"
                    })
                    .style("font-size", textSize)
                    .style("fill", textColor);
                this.labels.push(label);
            }

            let passedNodes: number[] = [];
            let colors: string[] = [ "#6182A2", "#788E3E", "#EA812D", "#554640", "#9DAEB0", "#a2c3a4", 
                                     "#AE5A31", "#B9AC78", "#2A4539", "#7F2F29", "#2e5266", "#313b72" ];
            let nextColor: number = 0;
            let colorTextCursor: number = 10;
            let colorTextWidth: number = 50;
            let jobColors: {Id: number, Color: string}[] = [];
            for (let row of rows) {
                let nodeId: number = row[1];
                let passed: boolean = false;
                for (let id of passedNodes) {
                    if (id == nodeId) {
                        passed = true;
                        break;
                    }
                }
                if (passed)
                    continue;

                passedNodes.push(nodeId);
                if (nodeId == 0)
                    continue;

                let jobId = row[1];
                let color: string = "";
                for (let jobColor of jobColors) {
                    if (jobColor.Id == jobId) {
                        color = jobColor.Color;
                        break;
                    }
                }
                if (color == "") {
                    color = colors[nextColor % colors.length];   
                    nextColor++;
                    jobColors.push({Id: jobId, Color: color});

                    if (nextColor < colors.length) {
                        let room: number = 10;
                        let circle: d3.Selection<SVGAElement> = this.container.append("circle").classed("circle", true);
                        circle.attr({
                                cx: colorTextCursor,
                                cy: room,
                                r: 5,
                            })
                            .attr("fill", color);
                        this.labels.push(circle);

                        let label: d3.Selection<SVGAElement> = this.container.append("text").classed("text", true);
                        label.text(String(jobId))
                            .attr({
                                x: colorTextCursor,
                                y: room,
                                dx: "0.5em",
                                dy: "0.1em",
                                "text-anchor": "start",
                                "dominant-baseline": "middle"
                            })
                            .style("font-size", textSize)
                            .style("fill", textColor);
                        this.labels.push(label);
                        colorTextCursor += colorTextWidth;
                    }
                }

                let prevX: number = -1;
                let prevDirection: number = 1;
                for (let row of rows) {
                    if (row[1] != nodeId)
                        continue;

                    let currTimeMs: number = row[0];
                    let prevUsage: number = row[2];
                    let currUsage: number = row[3];
                    let currX: number = marginL + Math.round(rangeX * (currTimeMs - minX) / (maxX - minX));
                    let prevY: number = marginT + Math.round(rangeY * (maxUsage - prevUsage) / maxUsage);
                    let currY: number = marginT + Math.round(rangeY * (maxUsage - currUsage) / maxUsage);
                    
                    if (prevX != -1) {
                        let line: d3.Selection<SVGAElement> = this.container.append("line").classed("line", true);
                        line.attr("x1", String(prevX))
                            .attr("y1", String(prevY))
                            .attr("x2", String(currX))
                            .attr("y2", String(prevY))
                            .attr("stroke-width", 3)
                            .attr("stroke", color);
                        this.segments.push(line);
                    }

                    let rectX: number = 0;
                    let rectY: number = 0;
                    let rectHeight: number = 0;
                    let currDirection: number = 0;
                    if (prevY > currY) {
                        rectX = currX;
                        rectY = currY;
                        rectHeight = prevY - currY + 1;
                        currDirection = -1;
                    } else {
                        rectX = currX - 8;
                        rectY = prevY;
                        rectHeight = currY - prevY + 1;
                        currDirection = 1;
                    }
                    if (prevX == -1 || prevDirection == currDirection || currX - prevX > rectWidth) {
                        let rect: d3.Selection<SVGAElement> = this.container.append("rect").classed("rect", true);
                        rect.attr("x", String(rectX))
                            .attr("y", String(rectY))
                            .attr("width", String(rectWidth))
                            .attr("height", String(rectHeight))
                            .attr("fill", color);
                        this.segments.push(rect);
                        prevDirection = currDirection;
                        prevX = currX;
                    }
                    
                    this.addDateText(currX, marginT + rangeY, currTimeMs);
                }
            }
        }
    }
}