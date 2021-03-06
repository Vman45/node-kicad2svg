'use strict';

var xmlUtils = require('./xmlUtils');
var Extents = require('./extents');
var mathHelpers = require('./mathHelpers');

var LAYER_BACK = (1 << 0);
var LAYER_FRONT = (1 << 15);
var LAYER_SOLDERMASK_BACK = (1 << 22);
var LAYER_SOLDERMASK_FRONT = (1 << 23);
var ALL_LAYERS = 0x1FFFFFFF;

// see: kicadcode/include/layers_id_colors_and_visibility.h
var LAYER_FIRST_COPPER = 0;
var LAYER_LAST_COPPER = 15;
var LAYER_SILKSCREEN_FRONT = 21;
var LAYER_SILKSCREEN_BACK = 20;
var LAYER_DRAW = 24;
var LAYER_COMMENT = 25;

function nullLog() {}
var log = nullLog;
//var log = function(a, b, c, d, e, f) {
//  console.log(a, b, c, d, e, f);
//};

module.exports = function(symbol, opts) {
  var json = exports.toJson(symbol, opts);
  return xmlUtils.toXml(json);
};

exports.toJson = function(module, opts) {
  opts = opts || {};
  var size = opts.size || 500;
  var pcbSide = opts.pcbSide || 'front';

  log(JSON.stringify(module, null, '  '));
  var drawOpts = {
    module: module,
    extents: new Extents(),
    pcbColor: "rgb(30,80,30)",
    silkScreenColor: "rgb(240,240,240)",
    drillColor: "rgb(0,0,0)",
    padColor: "rgb(150,150,150)",
    pcbSide: pcbSide
  };

  drawOpts.updateExtents = function(x, y) {
    log('updateExtents', x, y);
    this.extents.update(x, y);
  }.bind(drawOpts);

  var data = {
    _name: 'svg',
    _attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      version: "1.1",
      width: size,
      height: size,
      style: 'background-color: ' + drawOpts.pcbColor + ';'
    },
    _children: [
      {
        _name: 'g',
        _attrs: {
          class: 'viewport',
          transform: 'translate(800, 800)'
        },
        _children: toSvgElements(module, drawOpts)
      }
    ]
  };

  data._children[0]._attrs.transform = drawOpts.extents.calculateSvgTransformString(size);

  return data;
};

function toSvgElements(module, drawOpts) {
  var result = [];

  module.draw.forEach(function(draw) {
    var r = drawToSvg(draw, drawOpts);
    result = result.concat(r);
  });

// TODO: doesn't work quite right
//  module.text.forEach(function(pad) {
//    var r = textToSvg(pad, drawOpts);
//    result = result.concat(r);
//  });

  module.pads.forEach(function(pad) {
    var r = padToSvg(pad, drawOpts);
    result = result.concat(r);
  });

  module.pads.forEach(function(pad) {
    if (pad.drill) {
      result = result.concat(padDrillToSvg(pad, drawOpts));
    }
  });

  return result;
}

function textToSvg(draw, drawOpts) {
  log('textToSvg', JSON.stringify(draw, null, '  '));

  var width = ((draw.size.width / 1.4) * draw.value.length);
  var rotate = -parseFloat(draw.orientation) / 10.0;
  var x, y;

  if (Math.abs(rotate) == 90) {
    x = draw.pos.x;
    y = draw.pos.y + (width / 2);
    drawOpts.updateExtents(draw.pos.x, draw.pos.y - (width / 2));
    drawOpts.updateExtents(draw.pos.x, draw.pos.y + (width / 2));
  } else {
    x = draw.pos.x - (width / 2);
    y = draw.pos.y;
    drawOpts.updateExtents(draw.pos.x - (width / 2), draw.pos.y);
    drawOpts.updateExtents(draw.pos.x + (width / 2), draw.pos.y);
  }

  if (isOnCurrentLayer(draw, drawOpts)) {
    var result = {
      _name: 'text',
      _attrs: {
        x: x,
        y: y,
        'dominant-baseline': 'auto',
        'text-anchor': 'start',
        'font-size': draw.size.height,
        style: "fill: " + drawOpts.silkScreenColor + "; stroke-width: 0;",
        'transform': "rotate(" + rotate + ", " + x + ", " + y + ")"
      },
      _body: draw.value
    };
    log('textToSvg(result)', JSON.stringify(result, null, '  '));
    return [result];
  } else {
    return [];
  }
}

function drawToSvg(draw, drawOpts) {
  switch (draw.type) {
  case "segment":
    return drawSegmentToSvg(draw, drawOpts);

  case "circle":
    return drawCircleToSvg(draw, drawOpts);

  case "arc":
    return drawArcToSvg(draw, drawOpts);

  case "polygon":
    return drawPolygonToSvg(draw, drawOpts);

  default:
    throw new Error("Unsupported draw type '" + draw.type + "'");
  }
}

function isOnCurrentLayer(draw, drawOpts) {

  return (drawOpts.pcbSide == 'front' && draw.layer == LAYER_FIRST_COPPER)
           || (drawOpts.pcbSide == 'front' && draw.layer == LAYER_SILKSCREEN_FRONT)
           || (drawOpts.pcbSide == 'front' && draw.layer == LAYER_DRAW)
           || (drawOpts.pcbSide == 'front' && draw.layer == LAYER_COMMENT)
           || (drawOpts.pcbSide == 'back' && draw.layer == LAYER_SILKSCREEN_BACK)
    || (drawOpts.pcbSide == 'back' && draw.layer == LAYER_LAST_COPPER);
}

function drawSegmentToSvg(draw, drawOpts) {
  log('drawSegmentToSvg', JSON.stringify(draw, null, '  '));
  drawOpts.updateExtents(draw.start.x, draw.start.y);
  drawOpts.updateExtents(draw.end.x, draw.end.y);

  if (isOnCurrentLayer(draw, drawOpts)) {
    return [
      {
        _name: 'line',
        _attrs: {
          x1: draw.start.x,
          y1: draw.start.y,
          x2: draw.end.x,
          y2: draw.end.y,
          "stroke-linecap": "round",
          style: "stroke: " + drawOpts.silkScreenColor + "; stroke-width: " + draw.width + ";"
        }
      }
    ];
  } else {
    return [];
  }
}

function drawCircleToSvg(draw, drawOpts) {
  log('drawCircleToSvg', JSON.stringify(draw, null, '  '));
  drawOpts.updateExtents(draw.start.x, draw.start.y);
  drawOpts.updateExtents(draw.start.x + Math.abs(draw.end.x), draw.end.y);
  drawOpts.updateExtents(draw.start.x - Math.abs(draw.end.x), draw.end.y);
  drawOpts.updateExtents(draw.start.x, draw.end.y + Math.abs(draw.end.x));
  drawOpts.updateExtents(draw.start.x, draw.end.y - Math.abs(draw.end.x));

  if (isOnCurrentLayer(draw, drawOpts)) {
    var radius = mathHelpers.distance(draw.start, draw.end);
    var result = [
      {
        _name: 'circle',
        _attrs: {
          cx: draw.start.x,
          cy: draw.start.y,
          r: radius,
          fill: "none",
          style: "stroke: " + drawOpts.silkScreenColor + "; stroke-width: " + draw.width + ";"
        }
      }
    ];
    log('drawCircleToSvg(results)', JSON.stringify(result, null, '  '));
    return result;
  } else {
    return [];
  }
}

/*
 * {
 *   "type": "arc",
 *   "start": {
 *     "x": 500,
 *     "y": 0
 *   },
 *   "end": {
 *     "x": 900,
 *     "y": 0
 *   },
 *   "angle": 900,
 *   "width": 50,
 *   "layer": 21
 * }
 */
function drawArcToSvg(draw, drawOpts) {
  drawOpts.updateExtents(draw.start.x, draw.start.y);
  drawOpts.updateExtents(draw.center.x, draw.center.y);

  if (!isOnCurrentLayer(draw, drawOpts)) {
    return [];
  }

  log('drawArcToSvg', JSON.stringify(draw, null, '  '));
  var radius = mathHelpers.distance(draw.center, draw.start);
  var theta1 = mathHelpers.rad2deg(Math.atan2(draw.start.y - draw.center.y, draw.start.x - draw.center.x));
  var delta = draw.angle / 10.0;
  while (delta >= 360) {
    delta -= 360;
  }
  log('theta1', theta1);
  log('delta', delta);
  var vals = mathHelpers.convertCenterArcToSvg({
    cx: draw.center.x, // center x coordinate
    cy: draw.center.y, // center y coordinate
    rx: radius, // x-radius of ellipse
    ry: radius, // y-radius of ellipse
    theta1: theta1, // beginning angle of arc in degrees
    delta: delta, // arc extent in degrees
    phi: 0 // x-axis rotation angle in degrees
  });

  var d = 'M ' + vals.x0 + ' ' + vals.y0;
  d += ' A ' + vals.rx + ' ' + vals.ry + ' ' + vals.phi + ' ' + vals.largeArc + ' ' + vals.sweep + ' ' + vals.x1 + ' ' + vals.y1; // A rx ry x-axis-rotation large-arc-flag sweep-flag x y

  var result = [
    {
      _name: 'path',
      _attrs: {
        d: d,
        fill: "none",
        style: "stroke: " + drawOpts.silkScreenColor + "; stroke-width: " + draw.width + ";"
      }
    }
  ];
  log('drawArcToSvg(result)', JSON.stringify(result, null, '  '));
  return result;
}

function drawPolygonToSvg(draw, drawOpts) {
  log('drawPolygonToSvg', JSON.stringify(draw, null, '  '));

  var points = [];
  draw.points.forEach(function(pt) {
    drawOpts.updateExtents(pt.x, pt.y);
    points.push(pt.x + "," + pt.y);
  });

  if (isOnCurrentLayer(draw, drawOpts)) {
    var result = [
      {
        _name: 'polyline',
        _attrs: {
          points: points.join(" "),
          fill: "none",
          style: "stroke: " + drawOpts.silkScreenColor + "; stroke-width: " + draw.width + ";"
        }
      }
    ];
    log('drawPolygonToSvg(result)', JSON.stringify(result, null, '  '));
    return result;
  } else {
    return [];
  }
}

function padToSvg(pad, drawOpts) {
  log('padToSvg', JSON.stringify(pad, null, '  '));
  var result = [];

  var layerMask = getPadLayerMask(pad);
  var onBack = (layerMask & LAYER_SOLDERMASK_BACK) ? true : false;
  var onFront = (layerMask & LAYER_SOLDERMASK_FRONT) ? true : false;
  log('layerMask', '0x' + layerMask.toString(16), onBack, onFront);

  if ((drawOpts.pcbSide == 'front' && onFront)
    || (drawOpts.pcbSide == 'back' && onBack)) {
    switch (pad.shape) {
    case "C":
      result.push({
        _name: 'circle',
        _attrs: {
          cx: pad.pos.x,
          cy: pad.pos.y,
          r: pad.size.x / 2,
          fill: drawOpts.padColor,
          style: "stroke-width: 1"
        }
      });
      break;

    case "R":
      result.push({
        _name: 'rect',
        _attrs: {
          x: pad.pos.x - (pad.size.x / 2),
          y: pad.pos.y - (pad.size.y / 2),
          width: pad.size.x,
          height: pad.size.y,
          fill: drawOpts.padColor,
          style: "stroke-width: 999",
          'transform': "rotate(" + (pad.orientation / 10.0) + ", " + pad.pos.x + ", " + pad.pos.y + ")"
        }
      });
      break;

    case "T":
      // TODO: handle trapazoidal pads better
      result.push({
        _name: 'rect',
        _attrs: {
          x: pad.pos.x - (pad.size.x / 2),
          y: pad.pos.y - (pad.size.y / 2),
          width: pad.size.x,
          height: pad.size.y,
          fill: drawOpts.padColor,
          style: "stroke-width: 1",
          'transform': "rotate(" + (pad.orientation / 10.0) + ", " + pad.pos.x + ", " + pad.pos.y + ")"
        }
      });
      break;

    case "O":
      (function() {
        var rotation = pad.orientation / 10.0;
        if (pad.drill.dx > pad.drill.dy) {
          rotation += 90;
        }
        var width = Math.min(pad.size.x, pad.size.y);
        var height = Math.max(pad.size.x, pad.size.y);
        var top = pad.pos.y - (height / 2) + (width / 2);

        result.push({
          _name: 'circle',
          _attrs: {
            cx: pad.pos.x,
            cy: top,
            r: width / 2,
            fill: drawOpts.padColor,
            style: "stroke-width: 1",
            'transform': "rotate(" + rotation + ", " + pad.pos.x + ", " + pad.pos.y + ")"
          }
        });
        result.push({
          _name: 'circle',
          _attrs: {
            cx: pad.pos.x,
            cy: top + height - width,
            r: width / 2,
            fill: drawOpts.padColor,
            style: "stroke-width: 1",
            'transform': "rotate(" + rotation + ", " + pad.pos.x + ", " + pad.pos.y + ")"
          }
        });
        result.push({
          _name: 'rect',
          _attrs: {
            x: pad.pos.x - (width / 2),
            y: top,
            width: width,
            height: height - width,
            fill: drawOpts.padColor,
            style: "stroke-width: 1",
            'transform': "rotate(" + rotation + ", " + pad.pos.x + ", " + pad.pos.y + ")"
          }
        });
      })();
      break;

    default:
      throw new Error("Unsupported pad shape '" + pad.shape + "'");
    }
  }

  log('padToSvg(result)', JSON.stringify(result, null, '  '));
  return result;
}

function getPadLayerMask(pad) {
  if (pad.parts) {
    var attributes = pad.parts.filter(function(part) {
      return part.type == 'attribute';
    });
    if (attributes.length > 0) {
      return attributes[0].layerMask;
    }
  }
  return ALL_LAYERS;
}

function padDrillToSvg(pad, drawOpts) {
  log('padDrillToSvg', JSON.stringify(pad, null, '  '));

  var radius = pad.drill.pos.x / 2;

  drawOpts.updateExtents(pad.pos.x - radius, pad.pos.y - radius);
  drawOpts.updateExtents(pad.pos.x + radius, pad.pos.y + radius);

  if (pad.drill.shape == 'O') {
    var rotation = pad.orientation / 10.0;
    if (pad.drill.dx > pad.drill.dy) {
      rotation += 90;
    }
    var width = Math.min(pad.drill.dx, pad.drill.dy);
    var height = Math.max(pad.drill.dx, pad.drill.dy);
    var top = pad.pos.y - (height / 2) + (width / 2);
    return [
      {
        _name: 'rect',
        _attrs: {
          x: pad.pos.x - (width / 2),
          y: top,
          width: width,
          height: height - width,
          style: "fill: " + drawOpts.drillColor + "; stroke-width: 1",
          'transform': "rotate(" + rotation + ", " + pad.pos.x + ", " + pad.pos.y + ")"
        }
      },
      {
        _name: 'circle',
        _attrs: {
          cx: pad.pos.x,
          cy: top,
          r: width / 2,
          style: "fill: " + drawOpts.drillColor + "; stroke-width: 1",
          'transform': "rotate(" + rotation + ", " + pad.pos.x + ", " + pad.pos.y + ")"
        }
      },
      {
        _name: 'circle',
        _attrs: {
          cx: pad.pos.x,
          cy: top + height - width,
          r: width / 2,
          style: "fill: " + drawOpts.drillColor + "; stroke-width: 1",
          'transform': "rotate(" + rotation + ", " + pad.pos.x + ", " + pad.pos.y + ")"
        }
      }
    ];
  } else {
    return [
      {
        _name: 'circle',
        _attrs: {
          cx: pad.pos.x,
          cy: pad.pos.y,
          r: radius,
          style: "fill: " + drawOpts.drillColor + "; stroke-width: 1"
        }
      }
    ];
  }
}
