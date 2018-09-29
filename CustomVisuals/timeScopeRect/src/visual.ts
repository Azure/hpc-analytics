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
        private rectangles: d3.Selection<SVGAElement>[];
        private baseLines: d3.Selection<SVGAElement>[];
        private labels: d3.Selection<SVGAElement>[];

        private dateTextCursors: number[];

        constructor(options: VisualConstructorOptions) {
            this.svg = d3.select(options.element).append('svg').classed('myVisual', true);
            this.container = this.svg.append("g").classed('container', true);
            this.rectangles = [];
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
            let marginL: number = 50;
            let marginR: number = 30;
            let marginT: number = 30;
            let marginB: number = 30;
            let rangeX: number = width - marginL - marginR;
            let rangeY: number = height - marginT - marginB;

            this.svg.attr({
                width: width,
                height: height
            });

            for (let rect of this.rectangles)
                rect.remove();
            this.rectangles = [];
            for (let line of this.baseLines)
                line.remove();
            this.baseLines = [];
            for (let label of this.labels) 
                label.remove();
            this.labels = [];
            this.dateTextCursors = [];

            let rows: number[][] = dataView.table.rows as number[][];
            
            interface Node {
                Id: number,
                Size: number,
                Base: number,
            };

            let nodes: Node[] = [];
            let minX: number = -1;
            let maxX: number = -1;
            for (let row of rows) {
                let nodeId: number = row[2];
                let nodeSize: number = row[3];
                let passed: boolean = false;
                for (let node of nodes) {
                    if (node.Id == nodeId) {
                        passed = true;
                        break;    
                    }
                }
                if (!passed)
                    nodes.push({Id: nodeId, Size: nodeSize, Base: 0});

                if (minX == -1) {
                    minX = row[0];
                    maxX = row[1];
                } else {
                    minX = Math.min(row[0], minX);
                    maxX = Math.max(row[1], maxX);
                }
            }

            nodes.sort(function(a, b) {
                if (a.Id < b.Id)
                    return -1;
                if (a.Id > b.Id)
                    return 1;
                return 0;
            });

            let interval: number = 1 / 4;
            let totalShares: number = -interval;
            for (let node of nodes) {
                node.Base = totalShares + interval;
                totalShares += node.Size + interval;
            }

            for (let node of nodes) {
                if (node.Base == 0) {
                    let lineX: d3.Selection<SVGAElement> = this.container.append("line").classed("line", true);
                    lineX.attr("x1", marginL - 10)
                        .attr("y1", marginT + rangeY)
                        .attr("x2", marginL + rangeX + 10)
                        .attr("y2", marginT + rangeY)
                        .attr("stroke-width", 1.5)
                        .attr("stroke", "LightGray");
                    this.labels.push(lineX);
                }
                let lineX: d3.Selection<SVGAElement> = this.container.append("line").classed("line", true);
                    lineX.attr("x1", marginL - 10)
                        .attr("y1", marginT + rangeY * (totalShares - (node.Base + node.Size)) / totalShares - 2)
                        .attr("x2", marginL + rangeX + 10)
                        .attr("y2", marginT + rangeY * (totalShares - (node.Base + node.Size)) / totalShares - 2)
                        .attr("stroke-width", 1.5)
                        .attr("stroke", "LightGray");
                    this.labels.push(lineX);
                
                let label: d3.Selection<SVGAElement> = this.container.append("text").classed("text", true);
                label.text(String(node.Id))
                    .attr({
                        x: marginL - 10,
                        y: marginT + rangeY * (totalShares - (node.Base + node.Size / 2)) / totalShares,
                        dx: "-0.8em",
                        "text-anchor": "end",
                        "dominant-baseline": "central"
                    })
                    .style("font-size", textSize)
                    .style("fill", textColor);
                this.labels.push(label);
            }

            let colors: string[] = [ "#6182A2", "#788E3E", "#EA812D", "#554640", "#9DAEB0", "#a2c3a4", 
                                     "#AE5A31", "#B9AC78", "#2A4539", "#7F2F29", "#2e5266", "#313b72" ];
            let nextColor: number = 0;
            let colorTextCursor: number = 10;
            let colorTextWidth: number = 50;
            let jobColors: {Id: number, Color: string}[] = [];
            for (let row of rows) {
                let startTimeMs: number = row[0];
                let endTimeMs: number = row[1];
                let node: {Id: number, Size: number, Base: number} = null;
                for (let n of nodes) {
                    if (n.Id == row[2]) {
                        node = n;
                        break;
                    }
                }
                let coreId: number = row[4];
                let jobId: number = row[5];

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

                let rectX: number = Math.round(marginL + rangeX * (startTimeMs - minX) / (maxX - minX));                
                let rectY: number = Math.round(marginT + rangeY * (totalShares - (node.Base + coreId) - 1) / totalShares);
                let rectWidth: number = Math.round(rangeX * (endTimeMs - startTimeMs) / (maxX - minX));
                let rectHeight: number = Math.round(rangeY * 1 / totalShares - 1.5);
                if (rectWidth == 0)
                    rectWidth = 1;
                let rect: d3.Selection<SVGAElement> = this.container.append("rect").classed("rect", true);
                rect.attr("rx", "4")
                    .attr("ry", "4")
                    .attr("x", String(rectX))
                    .attr("y", String(rectY))
                    .attr("width", String(rectWidth))
                    .attr("height", String(rectHeight))
                    .attr("fill", color);
                this.rectangles.push(rect);

                this.addDateText(rectX, marginT + rangeY, startTimeMs);
                this.addDateText(rectX + rectWidth, marginT + rangeY, endTimeMs);
            }
        }
    }
}