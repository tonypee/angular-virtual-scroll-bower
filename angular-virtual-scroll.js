// angular-virtual-scroll - v0.3.0

// Include this first to define the module that the directives etc. hang off.
//
(function(){
'use strict';
angular.module('sf.virtualScroll', []);
}());



// sublist filter
// ==============
// Narrows a collection expression to a sub-collection.
//
(function(){
'use strict';
// (part of the sf.virtualScroll module).
var mod = angular.module('sf.virtualScroll');

mod.filter('sublist', function(){
  return function(input, range, start){
    return input.slice(start, start+range);
  };
});

}());



// sf-scroller directive
// =====================
// Makes a simple scrollbar widget using the native overflow: scroll mechanism.
//
/*jshint jquery:true */
(function(){
'use strict';
// (part of the sf.virtualScroll module).
var mod = angular.module('sf.virtualScroll');

mod.directive("sfScroller", function(){

  // Should be roughly a "row" height but it doesn't matter too much, it
  // determines how responsive the scroller will feel.
  var HEIGHT_MULTIPLIER = 18;

  // The range expression appears in the directive and must have the form:
  //
  //     x in a to b
  //
  // This helper will return `{ axis: "x", lower: "a", upper: "b" }`
  function parseRangeExpression (expression) {
    /*jshint regexp:false */
    var match = expression.match(/^(x|y)\s*(=|in)\s*(.+) to (.+)$/);
    if( !match ){
      throw new Error("Expected sfScroller in form of '_axis_ in _lower_ to _upper_' but got '" + expression + "'.");
    }
    return {
      axis: match[1],
      lower: match[3],
      upper: match[4]
    };
  }

  // just a post-link function
  return function(scope, element, attrs){
    var range = parseRangeExpression(attrs.sfScroller),
        lower = scope.$eval(range.lower),
        upper = scope.$eval(range.upper),
        horizontal = range.axis === 'x';
    element.css({
      // The element must expand to fit the parent
      // and `1em` seems to work most often for the scrollbar width
      // (can tweak with css if needed).
      height: horizontal ? '1em' : '100%',
      width: horizontal ? '100%' : '1em',
      "overflow-x": horizontal ? 'scroll' : 'hidden',
      "overflow-y": horizontal ? 'hidden' : 'scroll',
      // Want the scroller placed at the right edge of the parent
      position: 'absolute',
      top: horizontal ? '100%' : 0,
      right: 0
    }).parent().css({
      // so parent must create a new context for positioning.
      position: 'relative'
    });
    var dummy = angular.element('<div></div>');
    element.append(dummy);
    element.bind('scroll', function(){
      // When the user scrolls, push the new position into the ng world via
      // the `ng-model`.
      var newTop = element.prop('scrollTop');
      if( attrs.ngModel ){
        scope.$apply(attrs.ngModel + ' = ' + newTop/HEIGHT_MULTIPLIER);
      }
    });
    // Watch the values in the range expression
    scope.$watch(range.lower, function(newVal){
      lower = newVal;
      dummy.css('height', (upper-lower)*HEIGHT_MULTIPLIER+'px');
    });
    scope.$watch(range.upper, function(newVal){
      upper = newVal;
      dummy.css('height', (upper-lower)*HEIGHT_MULTIPLIER+'px');
    });
    // and make the position a 2-way binding
    scope.$watch(attrs.ngModel, function(newVal){
      var scrollTop = newVal * HEIGHT_MULTIPLIER;
      if( element.prop('scrollTop') !== scrollTop ){
        element.prop('scrollTop'. scrollTop);
      }
    });
  };
});

}());

// sf-virtual-repeat directive
// ===========================
// Like `ng-repeat` with reduced rendering and binding
//
(function(){
  'use strict';
  // (part of the sf.virtualScroll module).
  var mod = angular.module('sf.virtualScroll');

  mod.directive('sfVirtualRepeat', ['$log', function($log){

    return {
      transclude: 'element',
      priority: 1000,
      terminal: true,
      compile: sfVirtualRepeatCompile
    };

    // Turn the expression supplied to the directive:
    //
    //     a in b
    //
    // into `{ value: "a", collection: "b" }`
    function parseRepeatExpression(expression){
      var match = expression.match(/^\s*([\$\w]+)\s+in\s+(\S*)\s*$/);
      if (! match) {
        throw new Error("Expected sfVirtualRepeat in form of '_item_ in _collection_' but got '" +
                        expression + "'.");
      }
      return {
        value: match[1],
        collection: match[2]
      };
    }

    // Apply explicit height and overflow styles to the viewport element.
    //
    // If the viewport has a max-height (inherited or otherwise), set max-height.
    // Otherwise, set height from the current computed value or use
    // window.innerHeight as a fallback
    //
    function setViewportCss(viewport){
      var viewportCss = {'overflow': 'auto'},
          style = window.getComputedStyle ?
            window.getComputedStyle(viewport[0]) :
            viewport[0].currentStyle,
          maxHeight = style && style.getPropertyValue('max-height'),
          height = style && style.getPropertyValue('height');

      if( maxHeight && maxHeight !== '0px' ){
        viewportCss.maxHeight = maxHeight;
      }else if( height && height !== '0px' ){
        viewportCss.height = height;
      }else{
        viewportCss.height = window.innerHeight;
      }
      viewport.css(viewportCss);
    }

    // Apply explicit styles to the content element.
    //
    function setContentCss(content){
      var contentCss = {
        overflow: 'hidden',
        width:'auto',
        margin: 0,
        padding: 0,
        border: 0,
        'box-sizing': 'border-box'
      };
      content.css(contentCss);
    }

    // TODO: compute outerHeight (padding + border unless box-sizing is border)
    function computeRowHeight(element){
      var style = window.getComputedStyle ? window.getComputedStyle(element) : element.currentStyle,
          maxHeight = style && style.getPropertyValue('max-height'),
          height = style && style.getPropertyValue('height');

      if( height && height !== '0px' ){
        $log.info('Row height is "%s" from css height', height);
      }else if( maxHeight && maxHeight !== '0px' ) {
        height = maxHeight;
        $log.info('Row height is "%s" from css max-height', height);
      }else if( element[0].clientHeight ){
        height = element.clientHeight+'px';
        $log.info('Row height is "%s" from client height', height);
      }else{
        throw new Error("Unable to compute height of row");
      }
      angular.element(element).css('height', height);
      return parseInt(height, 10);
    }

    // The compile gathers information about the declaration. It doesn't make
    // much sense for separate compile/link as we need a viewport parent that
    // is exculsively ours.
    function sfVirtualRepeatCompile(element, attr, linker) {
      var ident = parseRepeatExpression(attr.sfVirtualRepeat),
          LOW_WATER = 100,
          HIGH_WATER = 200;

      return {
        post: sfVirtualRepeatPostLink
      };
      // ----

      // Set up the initial value for our watch expression (which is just the
      // start and length of the active rows and the collection length) and
      // adds a listener to handle child scopes based on the active rows.
      function sfVirtualRepeatPostLink(scope, iterStartElement /*, attr*/){

        var coll = scope.$eval(ident.collection);
        var rendered = [];
        var rowHeight = 0;
        var visibleRows = 0;
        // The list structure is controlled by a few simple state variables
        var active = {
          // The index of the first active element
          start: 0,
          // The number of active elements
          active: 20,
          // The total number of elements
          len: coll.length
        };
        var content = iterStartElement.parent();

        var viewport = content.parent(); //TODO: clever viewport finder

        setContentCss(content);
        setViewportCss(viewport);
        // When the user scrolls, we move the active.start
        viewport.bind('scroll', sfVirtualRepeatOnScroll);

        // The watch on the collection is just a watch on the length of the
        // collection. We don't care if the content changes.
        scope.$watch(sfVirtualRepeatWatchExpression, sfVirtualRepeatListener);

        // and that's the link done! All the action is in the handlers...
        return;
        // ----

        // Apply explicit styles to the item element
        function setElementCss (element) {
          var elementCss = {
            display: 'block',
            margin: '0'
          };
          if( rowHeight ){
            elementCss.height = rowHeight+'px';
          }
          element.css(elementCss);
        }

        function makeNewScope (idx, collection, containerScope) {
          var childScope = containerScope.$new();
          childScope[ident.value] = coll[idx];
          childScope.$index = idx;
          childScope.$first = (idx === 0);
          childScope.$last = (idx === (coll.length - 1));
          childScope.$middle = !(childScope.$first || childScope.$last);
          childScope.$watch(function updateChildScopeItem(){
            childScope[ident.value] = coll[idx];
          });
          return childScope;
        }

        function addElements (start, end, collection, containerScope, insPoint) {
          var frag = document.createDocumentFragment();
          var newElements = [], element, idx, childScope;
          for( idx = start; idx !== end; idx ++ ){
            childScope = makeNewScope(idx, collection, containerScope);
            element = linker(childScope, angular.noop);
            setElementCss(element);
            newElements.push(element);
            frag.appendChild(element[0]);
          }
          insPoint.after(frag);
          return newElements;
        }

        function sfVirtualRepeatOnScroll(evt){
          var top = evt.target.scrollTop,
              firstVisibleRow = Math.floor(top / rowHeight),
              start = Math.max(0,
                Math.min(firstVisibleRow - LOW_WATER,
                  Math.max(firstVisibleRow - HIGH_WATER, active.start))),
              end;
          visibleRows = Math.ceil(viewport[0].clientHeight / rowHeight);
          end = Math.min(
            active.len,
            Math.max(firstVisibleRow + visibleRows + LOW_WATER,
               Math.min(firstVisibleRow + visibleRows + HIGH_WATER,
                        active.start + active.active)));
          $log.log('scroll to row %d (show %d - %d)', firstVisibleRow, start, end);
          // Enter the angular world for the state change to take effect.
          scope.$apply(function(){
            active = {
              start: start,
              active: end - start,
              len: active.len
            };
          });
        }

        function sfVirtualRepeatWatchExpression(/*scope*/){
          coll = scope.$eval(ident.collection);
          if( coll.length !== active.len ){
            active = {
              start: active.start,
              active: active.active,
              len: coll.length
            };
          }
          return active;
        }

        function destroyActiveElements (action, count) {
          var dead, ii, remover = Array.prototype[action];
          for( ii = 0; ii < count; ii++ ){
            dead = remover.call(rendered);
            dead.scope().$destroy();
            dead.remove();
          }
        }

        // When the watch expression for the repeat changes, we may need to add
        // and remove scopes and elements
        function sfVirtualRepeatListener(newValue, oldValue, scope){
          var oldEnd = oldValue.start + oldValue.active,
              collection = scope.$eval(ident.collection),
              newElements;
          if( newValue === oldValue ){
            $log.info('initial listen');
            newElements = addElements(newValue.start, oldEnd, collection, scope, iterStartElement);
            rendered = newElements;
            rowHeight = computeRowHeight(newElements[0][0]);
          }else{
            var newEnd = newValue.start + newValue.active;
            var forward = newValue.start > oldValue.start;
            var delta = forward ? newValue.start - oldValue.start
                                : oldValue.start - newValue.start;
            var endDelta = newEnd >= oldEnd ? newEnd - oldEnd : oldEnd - newEnd;
            var contiguous = delta < (forward ? oldValue.active : newValue.active);
            $log.info('change by %d,%d rows %s', delta, endDelta, forward ? 'forward' : 'backward');
            if( !contiguous ){
              $log.info('non-contiguous change');
              destroyActiveElements('pop', rendered.length);
              rendered = addElements(newValue.start, newEnd, collection, scope, iterStartElement);
            }else{
              if( forward ){
                $log.info('need to remove from the top');
                destroyActiveElements('shift', delta);
              }else if( delta ){
                $log.info('need to add at the top');
                newElements = addElements(
                  newValue.start,
                  oldValue.start,
                  collection, scope, iterStartElement);
                rendered = newElements.concat(rendered);
              }
              if( newEnd < oldEnd ){
                $log.info('need to remove from the bottom');
                destroyActiveElements('pop', oldEnd - newEnd);
              }else if( endDelta ){
                var lastElement = rendered[rendered.length-1];
                $log.info('need to add to the bottom');
                newElements = addElements(
                  oldEnd,
                  newEnd,
                  collection, scope, lastElement);
                rendered = rendered.concat(newElements);
              }
            }
            content.css({'padding-top': newValue.start * rowHeight + 'px'});
          }
          content.css({'height': newValue.len * rowHeight + 'px'});
        }
      }
    }
  }]);

}());

