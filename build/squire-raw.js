/* Copyright © 2011-2013 by Neil Jenkins. MIT Licensed. */

( function ( doc ) {

"use strict";
/*global doc, navigator */
/*jshint strict:false */

var DOCUMENT_POSITION_PRECEDING = 2; // Node.DOCUMENT_POSITION_PRECEDING
var ELEMENT_NODE = 1;                // Node.ELEMENT_NODE;
var TEXT_NODE = 3;                   // Node.TEXT_NODE;
var SHOW_ELEMENT = 1;                // NodeFilter.SHOW_ELEMENT;
var SHOW_TEXT = 4;                   // NodeFilter.SHOW_TEXT;
var FILTER_ACCEPT = 1;               // NodeFilter.FILTER_ACCEPT;
var FILTER_SKIP = 3;                 // NodeFilter.FILTER_SKIP;

var START_TO_START = 0; // Range.START_TO_START
var START_TO_END = 1;   // Range.START_TO_END
var END_TO_END = 2;     // Range.END_TO_END
var END_TO_START = 3;   // Range.END_TO_START

var win = doc.defaultView;

var ua = navigator.userAgent;

var isIOS = /iP(?:ad|hone|od)/.test( ua );
var isMac = /Mac OS X/.test( ua );

var isGecko = /Gecko\//.test( ua );
var isIE = /Trident\//.test( ua );
var isIE8 = ( win.ie === 8 );
var isOpera = !!win.opera;
var isWebKit = /WebKit\//.test( ua );

var ctrlKey = isMac ? 'meta-' : 'ctrl-';

var useTextFixer = isIE || isOpera;
var cantFocusEmptyTextNodes = isIE || isWebKit;
var losesSelectionOnBlur = isIE;
var hasBuggySplit = ( function () {
    var div = doc.createElement( 'div' ),
        text = doc.createTextNode( '12' );
    div.appendChild( text );
    text.splitText( 2 );
    return div.childNodes.length !== 2;
}() );

var notWS = /\S/;

var indexOf = Array.prototype.indexOf;
/*global FILTER_ACCEPT */
/*jshint strict:false */

/*
    Native TreeWalker is buggy in IE and Opera:
    * IE9/10 sometimes throw errors when calling TreeWalker#nextNode or
      TreeWalker#previousNode. No way to feature detect this.
    * Some versions of Opera have a bug in TreeWalker#previousNode which makes
      it skip to the wrong node.

    Rather than risk further bugs, it's easiest just to implement our own
    (subset) of the spec in all browsers.
*/

var typeToBitArray = {
    // ELEMENT_NODE
    1: 1,
    // ATTRIBUTE_NODE
    2: 2,
    // TEXT_NODE
    3: 4,
    // COMMENT_NODE
    8: 128,
    // DOCUMENT_NODE
    9: 256,
    // DOCUMENT_FRAGMENT_NODE
    11: 1024
};

function TreeWalker ( root, nodeType, filter ) {
    this.root = this.currentNode = root;
    this.nodeType = nodeType;
    this.filter = filter;
}

TreeWalker.prototype.nextNode = function () {
    var current = this.currentNode,
        root = this.root,
        nodeType = this.nodeType,
        filter = this.filter,
        node;
    while ( true ) {
        node = current.firstChild;
        while ( !node && current ) {
            if ( current === root ) {
                break;
            }
            node = current.nextSibling;
            if ( !node ) { current = current.parentNode; }
        }
        if ( !node ) {
            return null;
        }
        if ( ( typeToBitArray[ node.nodeType ] & nodeType ) &&
                filter( node ) === FILTER_ACCEPT ) {
            this.currentNode = node;
            return node;
        }
        current = node;
    }
};

TreeWalker.prototype.previousNode = function () {
    var current = this.currentNode,
        root = this.root,
        nodeType = this.nodeType,
        filter = this.filter,
        node;
    while ( true ) {
        if ( current === root ) {
            return null;
        }
        node = current.previousSibling;
        if ( node ) {
            while ( current = node.lastChild ) {
                node = current;
            }
        } else {
            node = current.parentNode;
        }
        if ( !node ) {
            return null;
        }
        if ( ( typeToBitArray[ node.nodeType ] & nodeType ) &&
                filter( node ) === FILTER_ACCEPT ) {
            this.currentNode = node;
            return node;
        }
        current = node;
    }
};
/*global
    ELEMENT_NODE,
    TEXT_NODE,
    SHOW_ELEMENT,
    FILTER_ACCEPT,
    FILTER_SKIP,
    win,
    isOpera,
    useTextFixer,
    cantFocusEmptyTextNodes,

    TreeWalker,

    Text
*/
/*jshint strict:false */

var inlineNodeNames  = /^(?:#text|A(?:BBR|CRONYM)?|B(?:R|D[IO])?|C(?:ITE|ODE)|D(?:FN|EL)|EM|FONT|HR|I(?:NPUT|MG|NS)?|KBD|Q|R(?:P|T|UBY)|S(?:U[BP]|PAN|TRONG|AMP)|U)$/;

var leafNodeNames = {
    BR: 1,
    IMG: 1,
    INPUT: 1
};

function every ( nodeList, fn ) {
    var l = nodeList.length;
    while ( l-- ) {
        if ( !fn( nodeList[l] ) ) {
            return false;
        }
    }
    return true;
}

// ---

function hasTagAttributes ( node, tag, attributes ) {
    if ( node.nodeName !== tag ) {
        return false;
    }
    for ( var attr in attributes ) {
        if ( node.getAttribute( attr ) !== attributes[ attr ] ) {
            return false;
        }
    }
    return true;
}
function areAlike ( node, node2 ) {
    return (
        node.nodeType === node2.nodeType &&
        node.nodeName === node2.nodeName &&
        node.className === node2.className &&
        ( ( !node.style && !node2.style ) ||
          node.style.cssText === node2.style.cssText )
    );
}

function isLeaf ( node ) {
    return node.nodeType === ELEMENT_NODE &&
        !!leafNodeNames[ node.nodeName ];
}
function isInline ( node ) {
    return inlineNodeNames.test( node.nodeName );
}
function isBlock ( node ) {
    return node.nodeType === ELEMENT_NODE &&
        !isInline( node ) && every( node.childNodes, isInline );
}
function isContainer ( node ) {
    return node.nodeType === ELEMENT_NODE &&
        !isInline( node ) && !isBlock( node );
}

function acceptIfBlock ( el ) {
    return isBlock( el ) ? FILTER_ACCEPT : FILTER_SKIP;
}
function getBlockWalker ( node ) {
    var doc = node.ownerDocument,
        walker = new TreeWalker(
            doc.body, SHOW_ELEMENT, acceptIfBlock, false );
    walker.currentNode = node;
    return walker;
}

function getPreviousBlock ( node ) {
    return getBlockWalker( node ).previousNode();
}
function getNextBlock ( node ) {
    return getBlockWalker( node ).nextNode();
}
function getNearest ( node, tag, attributes ) {
    do {
        if ( hasTagAttributes( node, tag, attributes ) ) {
            return node;
        }
    } while ( node = node.parentNode );
    return null;
}

function getPath ( node ) {
    var parent = node.parentNode,
        path, id, className, classNames;
    if ( !parent || node.nodeType !== ELEMENT_NODE ) {
        path = parent ? getPath( parent ) : '';
    } else {
        path = getPath( parent );
        path += ( path ? '>' : '' ) + node.nodeName;
        if ( id = node.id ) {
            path += '#' + id;
        }
        if ( className = node.className.trim() ) {
            classNames = className.split( /\s\s*/ );
            classNames.sort();
            path += '.';
            path += classNames.join( '.' );
        }
    }
    return path;
}

function getLength ( node ) {
    var nodeType = node.nodeType;
    return nodeType === ELEMENT_NODE ?
        node.childNodes.length : node.length || 0;
}

function detach ( node ) {
    var parent = node.parentNode;
    if ( parent ) {
        parent.removeChild( node );
    }
    return node;
}
function replaceWith ( node, node2 ) {
    var parent = node.parentNode;
    if ( parent ) {
        parent.replaceChild( node2, node );
    }
}
function empty ( node ) {
    var frag = node.ownerDocument.createDocumentFragment(),
        childNodes = node.childNodes,
        l = childNodes ? childNodes.length : 0;
    while ( l-- ) {
        frag.appendChild( node.firstChild );
    }
    return frag;
}

function fixCursor ( node ) {
    // In Webkit and Gecko, block level elements are collapsed and
    // unfocussable if they have no content. To remedy this, a <BR> must be
    // inserted. In Opera and IE, we just need a textnode in order for the
    // cursor to appear.
    var doc = node.ownerDocument,
        root = node,
        fixer, child;

    if ( node.nodeName === 'BODY' ) {
        if ( !( child = node.firstChild ) || child.nodeName === 'BR' ) {
            fixer = doc.createElement( 'DIV' );
            if ( child ) {
                node.replaceChild( fixer, child );
            }
            else {
                node.appendChild( fixer );
            }
            node = fixer;
            fixer = null;
        }
    }

    if ( isInline( node ) ) {
        if ( !node.firstChild ) {
            if ( cantFocusEmptyTextNodes ) {
                fixer = doc.createTextNode( '\u200B' );
                if ( win.editor ) {
                    win.editor._setPlaceholderTextNode( fixer );
                }
            } else {
                fixer = doc.createTextNode( '' );
            }
        }
    } else {
        if ( useTextFixer ) {
            while ( node.nodeType !== TEXT_NODE && !isLeaf( node ) ) {
                child = node.firstChild;
                if ( !child ) {
                    fixer = doc.createTextNode( '' );
                    break;
                }
                node = child;
            }
            if ( node.nodeType === TEXT_NODE ) {
                // Opera will collapse the block element if it contains
                // just spaces (but not if it contains no data at all).
                if ( /^ +$/.test( node.data ) ) {
                    node.data = '';
                }
            } else if ( isLeaf( node ) ) {
                node.parentNode.insertBefore( doc.createTextNode( '' ), node );
            }
        }
        else if ( !node.querySelector( 'BR' ) ) {
            fixer = doc.createElement( 'BR' );
            while ( ( child = node.lastElementChild ) && !isInline( child ) ) {
                node = child;
            }
        }
    }
    if ( fixer ) {
        node.appendChild( fixer );
    }

    return root;
}

function split ( node, offset, stopNode ) {
    var nodeType = node.nodeType,
        parent, clone, next;
    if ( nodeType === TEXT_NODE && node !== stopNode ) {
        return split( node.parentNode, node.splitText( offset ), stopNode );
    }
    if ( nodeType === ELEMENT_NODE ) {
        if ( typeof( offset ) === 'number' ) {
            offset = offset < node.childNodes.length ?
                node.childNodes[ offset ] : null;
        }
        if ( node === stopNode ) {
            return offset;
        }

        // Clone node without children
        parent = node.parentNode;
        clone = node.cloneNode( false );

        // Add right-hand siblings to the clone
        while ( offset ) {
            next = offset.nextSibling;
            clone.appendChild( offset );
            offset = next;
        }

        // DO NOT NORMALISE. This may undo the fixCursor() call
        // of a node lower down the tree!

        // We need something in the element in order for the cursor to appear.
        fixCursor( node );
        fixCursor( clone );

        // Inject clone after original node
        if ( next = node.nextSibling ) {
            parent.insertBefore( clone, next );
        } else {
            parent.appendChild( clone );
        }

        // Keep on splitting up the tree
        return split( parent, clone, stopNode );
    }
    return offset;
}

function mergeInlines ( node, range ) {
    if ( node.nodeType !== ELEMENT_NODE ) {
        return;
    }
    var children = node.childNodes,
        l = children.length,
        frags = [],
        child, prev, len;
    while ( l-- ) {
        child = children[l];
        prev = l && children[ l - 1 ];
        if ( l && isInline( child ) && areAlike( child, prev ) &&
                !leafNodeNames[ child.nodeName ] ) {
            if ( range.startContainer === child ) {
                range.startContainer = prev;
                range.startOffset += getLength( prev );
            }
            if ( range.endContainer === child ) {
                range.endContainer = prev;
                range.endOffset += getLength( prev );
            }
            if ( range.startContainer === node ) {
                if ( range.startOffset > l ) {
                    range.startOffset -= 1;
                }
                else if ( range.startOffset === l ) {
                    range.startContainer = prev;
                    range.startOffset = getLength( prev );
                }
            }
            if ( range.endContainer === node ) {
                if ( range.endOffset > l ) {
                    range.endOffset -= 1;
                }
                else if ( range.endOffset === l ) {
                    range.endContainer = prev;
                    range.endOffset = getLength( prev );
                }
            }
            detach( child );
            if ( child.nodeType === TEXT_NODE ) {
                prev.appendData( child.data.replace( /\u200B/g, '' ) );
            }
            else {
                frags.push( empty( child ) );
            }
        }
        else if ( child.nodeType === ELEMENT_NODE ) {
            len = frags.length;
            while ( len-- ) {
                child.appendChild( frags.pop() );
            }
            mergeInlines( child, range );
        }
    }
}

function mergeWithBlock ( block, next, range ) {
    var container = next,
        last, offset, _range;
    while ( container.parentNode.childNodes.length === 1 ) {
        container = container.parentNode;
    }
    detach( container );

    offset = block.childNodes.length;

    // Remove extra <BR> fixer if present.
    last = block.lastChild;
    if ( last && last.nodeName === 'BR' ) {
        block.removeChild( last );
        offset -= 1;
    }

    _range = {
        startContainer: block,
        startOffset: offset,
        endContainer: block,
        endOffset: offset
    };

    block.appendChild( empty( next ) );
    mergeInlines( block, _range );

    range.setStart( _range.startContainer, _range.startOffset );
    range.collapse( true );

    // Opera inserts a BR if you delete the last piece of text
    // in a block-level element. Unfortunately, it then gets
    // confused when setting the selection subsequently and
    // refuses to accept the range that finishes just before the
    // BR. Removing the BR fixes the bug.
    // Steps to reproduce bug: Type "a-b-c" (where - is return)
    // then backspace twice. The cursor goes to the top instead
    // of after "b".
    if ( isOpera && ( last = block.lastChild ) && last.nodeName === 'BR' ) {
        block.removeChild( last );
    }
}

function mergeContainers ( node ) {
    var prev = node.previousSibling,
        first = node.firstChild;
    if ( prev && areAlike( prev, node ) && isContainer( prev ) ) {
        detach( node );
        prev.appendChild( empty( node ) );
        if ( first ) {
            mergeContainers( first );
        }
    }
}

function createElement ( doc, tag, props, children ) {
    var el = doc.createElement( tag ),
        attr, i, l;
    if ( props instanceof Array ) {
        children = props;
        props = null;
    }
    if ( props ) {
        for ( attr in props ) {
            el.setAttribute( attr, props[ attr ] );
        }
    }
    if ( children ) {
        for ( i = 0, l = children.length; i < l; i += 1 ) {
            el.appendChild( children[i] );
        }
    }
    return el;
}
/*global
    ELEMENT_NODE,
    TEXT_NODE,
    SHOW_TEXT,
    FILTER_ACCEPT,
    START_TO_START,
    START_TO_END,
    END_TO_END,
    END_TO_START,
    indexOf,

    TreeWalker,

    isLeaf,
    isInline,
    isBlock,
    getPreviousBlock,
    getNextBlock,
    getLength,
    fixCursor,
    split,
    mergeWithBlock,
    mergeContainers
*/
/*jshint strict:false */

var getNodeBefore = function ( node, offset ) {
    var children = node.childNodes;
    while ( offset && node.nodeType === ELEMENT_NODE ) {
        node = children[ offset - 1 ];
        children = node.childNodes;
        offset = children.length;
    }
    return node;
};

var getNodeAfter = function ( node, offset ) {
    if ( node.nodeType === ELEMENT_NODE ) {
        var children = node.childNodes;
        if ( offset < children.length ) {
            node = children[ offset ];
        } else {
            while ( node && !node.nextSibling ) {
                node = node.parentNode;
            }
            if ( node ) { node = node.nextSibling; }
        }
    }
    return node;
};

// ---

var forEachTextNodeInRange = function ( range, fn ) {
    range = range.cloneRange();
    moveRangeBoundariesDownTree( range );

    var startContainer = range.startContainer,
        endContainer = range.endContainer,
        root = range.commonAncestorContainer,
        walker = new TreeWalker(
            root, SHOW_TEXT, function ( node ) {
                return FILTER_ACCEPT;
        }, false ),
        textnode = walker.currentNode = startContainer;

    while ( !fn( textnode, range ) &&
        textnode !== endContainer &&
        ( textnode = walker.nextNode() ) ) {}
};

var getTextContentInRange = function ( range ) {
    var textContent = '';
    forEachTextNodeInRange( range, function ( textnode, range ) {
        var value = textnode.data;
        if ( value && ( /\S/.test( value ) ) ) {
            if ( textnode === range.endContainer ) {
                value = value.slice( 0, range.endOffset );
            }
            if ( textnode === range.startContainer ) {
                value = value.slice( range.startOffset );
            }
            textContent += value;
        }
    });
    return textContent;
};

// ---

var insertNodeInRange = function ( range, node ) {
    // Insert at start.
    var startContainer = range.startContainer,
        startOffset = range.startOffset,
        endContainer = range.endContainer,
        endOffset = range.endOffset,
        parent, children, childCount, afterSplit;

    // If part way through a text node, split it.
    if ( startContainer.nodeType === TEXT_NODE ) {
        parent = startContainer.parentNode;
        children = parent.childNodes;
        if ( startOffset === startContainer.length ) {
            startOffset = indexOf.call( children, startContainer ) + 1;
            if ( range.collapsed ) {
                endContainer = parent;
                endOffset = startOffset;
            }
        } else {
            if ( startOffset ) {
                afterSplit = startContainer.splitText( startOffset );
                if ( endContainer === startContainer ) {
                    endOffset -= startOffset;
                    endContainer = afterSplit;
                }
                else if ( endContainer === parent ) {
                    endOffset += 1;
                }
                startContainer = afterSplit;
            }
            startOffset = indexOf.call( children, startContainer );
        }
        startContainer = parent;
    } else {
        children = startContainer.childNodes;
    }

    childCount = children.length;

    if ( startOffset === childCount) {
        startContainer.appendChild( node );
    } else {
        startContainer.insertBefore( node, children[ startOffset ] );
    }
    if ( startContainer === endContainer ) {
        endOffset += children.length - childCount;
    }

    range.setStart( startContainer, startOffset );
    range.setEnd( endContainer, endOffset );
};

var extractContentsOfRange = function ( range, common ) {
    var startContainer = range.startContainer,
        startOffset = range.startOffset,
        endContainer = range.endContainer,
        endOffset = range.endOffset;

    if ( !common ) {
        common = range.commonAncestorContainer;
    }

    if ( common.nodeType === TEXT_NODE ) {
        common = common.parentNode;
    }

    var endNode = split( endContainer, endOffset, common ),
        startNode = split( startContainer, startOffset, common ),
        frag = common.ownerDocument.createDocumentFragment(),
        next;

    // End node will be null if at end of child nodes list.
    while ( startNode !== endNode ) {
        next = startNode.nextSibling;
        frag.appendChild( startNode );
        startNode = next;
    }

    range.setStart( common, endNode ?
        indexOf.call( common.childNodes, endNode ) :
            common.childNodes.length );
    range.collapse( true );

    fixCursor( common );

    return frag;
};

var deleteContentsOfRange = function ( range ) {
    // Move boundaries up as much as possible to reduce need to split.
    moveRangeBoundariesUpTree( range );

    // Remove selected range
    extractContentsOfRange( range );

    // If we split into two different blocks, merge the blocks.
    var startBlock = getStartBlockOfRange( range ),
        endBlock = getEndBlockOfRange( range );
    if ( startBlock && endBlock && startBlock !== endBlock ) {
        mergeWithBlock( startBlock, endBlock, range );
    }

    // Ensure block has necessary children
    if ( startBlock ) {
        fixCursor( startBlock );
    }

    // Ensure body has a block-level element in it.
    var body = range.endContainer.ownerDocument.body,
        child = body.firstChild;
    if ( !child || child.nodeName === 'BR' ) {
        fixCursor( body );
        range.selectNodeContents( body.firstChild );
    }

    // Ensure valid range (must have only block or inline containers)
    var isCollapsed = range.collapsed;
    moveRangeBoundariesDownTree( range );
    if ( isCollapsed ) {
        // Collapse
        range.collapse( true );
    }
};

// ---

var insertTreeFragmentIntoRange = function ( range, frag ) {
    // Check if it's all inline content
    var allInline = true,
        children = frag.childNodes,
        l = children.length;
    while ( l-- ) {
        if ( !isInline( children[l] ) ) {
            allInline = false;
            break;
        }
    }

    // Delete any selected content
    if ( !range.collapsed ) {
        deleteContentsOfRange( range );
    }

    // Move range down into text ndoes
    moveRangeBoundariesDownTree( range );

    // If inline, just insert at the current position.
    if ( allInline ) {
        insertNodeInRange( range, frag );
        range.collapse( false );
    }
    // Otherwise, split up to body, insert inline before and after split
    // and insert block in between split, then merge containers.
    else {
        var nodeAfterSplit = split( range.startContainer, range.startOffset,
                range.startContainer.ownerDocument.body ),
            nodeBeforeSplit = nodeAfterSplit.previousSibling,
            startContainer = nodeBeforeSplit,
            startOffset = startContainer.childNodes.length,
            endContainer = nodeAfterSplit,
            endOffset = 0,
            parent = nodeAfterSplit.parentNode,
            child, node;

        while ( ( child = startContainer.lastChild ) &&
                child.nodeType === ELEMENT_NODE &&
                child.nodeName !== 'BR' ) {
            startContainer = child;
            startOffset = startContainer.childNodes.length;
        }
        while ( ( child = endContainer.firstChild ) &&
                child.nodeType === ELEMENT_NODE &&
                child.nodeName !== 'BR' ) {
            endContainer = child;
        }
        while ( ( child = frag.firstChild ) && isInline( child ) ) {
            startContainer.appendChild( child );
        }
        while ( ( child = frag.lastChild ) && isInline( child ) ) {
            endContainer.insertBefore( child, endContainer.firstChild );
            endOffset += 1;
        }

        // Fix cursor then insert block(s)
        node = frag;
        while ( node = getNextBlock( node ) ) {
            fixCursor( node );
        }
        parent.insertBefore( frag, nodeAfterSplit );

        // Remove empty nodes created by split and merge inserted containers
        // with edges of split
        node = nodeAfterSplit.previousSibling;
        if ( !nodeAfterSplit.textContent ) {
            parent.removeChild( nodeAfterSplit );
        } else {
            mergeContainers( nodeAfterSplit );
        }
        if ( !nodeAfterSplit.parentNode ) {
            endContainer = node;
            endOffset = getLength( endContainer );
        }

        if ( !nodeBeforeSplit.textContent) {
            startContainer = nodeBeforeSplit.nextSibling;
            startOffset = 0;
            parent.removeChild( nodeBeforeSplit );
        } else {
            mergeContainers( nodeBeforeSplit );
        }

        range.setStart( startContainer, startOffset );
        range.setEnd( endContainer, endOffset );
        moveRangeBoundariesDownTree( range );
    }
};

// ---

var isNodeContainedInRange = function ( range, node, partial ) {
    var nodeRange = node.ownerDocument.createRange();

    nodeRange.selectNode( node );

    if ( partial ) {
        // Node must not finish before range starts or start after range
        // finishes.
        var nodeEndBeforeStart = ( range.compareBoundaryPoints(
                END_TO_START, nodeRange ) > -1 ),
            nodeStartAfterEnd = ( range.compareBoundaryPoints(
                START_TO_END, nodeRange ) < 1 );
        return ( !nodeEndBeforeStart && !nodeStartAfterEnd );
    }
    else {
        // Node must start after range starts and finish before range
        // finishes
        var nodeStartAfterStart = ( range.compareBoundaryPoints(
                START_TO_START, nodeRange ) < 1 ),
            nodeEndBeforeEnd = ( range.compareBoundaryPoints(
                END_TO_END, nodeRange ) > -1 );
        return ( nodeStartAfterStart && nodeEndBeforeEnd );
    }
};

var moveRangeBoundariesDownTree = function ( range ) {
    var startContainer = range.startContainer,
        startOffset = range.startOffset,
        endContainer = range.endContainer,
        endOffset = range.endOffset,
        child;

    while ( startContainer.nodeType !== TEXT_NODE ) {
        child = startContainer.childNodes[ startOffset ];
        if ( !child || isLeaf( child ) ) {
            break;
        }
        startContainer = child;
        startOffset = 0;
    }
    if ( endOffset ) {
        while ( endContainer.nodeType !== TEXT_NODE ) {
            child = endContainer.childNodes[ endOffset - 1 ];
            if ( !child || isLeaf( child ) ) {
                break;
            }
            endContainer = child;
            endOffset = getLength( endContainer );
        }
    } else {
        while ( endContainer.nodeType !== TEXT_NODE ) {
            child = endContainer.firstChild;
            if ( !child || isLeaf( child ) ) {
                break;
            }
            endContainer = child;
        }
    }

    // If collapsed, this algorithm finds the nearest text node positions
    // *outside* the range rather than inside, but also it flips which is
    // assigned to which.
    if ( range.collapsed ) {
        range.setStart( endContainer, endOffset );
        range.setEnd( startContainer, startOffset );
    } else {
        range.setStart( startContainer, startOffset );
        range.setEnd( endContainer, endOffset );
    }
};

var moveRangeBoundariesUpTree = function ( range, common ) {
    var startContainer = range.startContainer,
        startOffset = range.startOffset,
        endContainer = range.endContainer,
        endOffset = range.endOffset,
        parent;

    if ( !common ) {
        common = range.commonAncestorContainer;
    }

    while ( startContainer !== common && !startOffset ) {
        parent = startContainer.parentNode;
        startOffset = indexOf.call( parent.childNodes, startContainer );
        startContainer = parent;
    }

    while ( endContainer !== common &&
            endOffset === getLength( endContainer ) ) {
        parent = endContainer.parentNode;
        endOffset = indexOf.call( parent.childNodes, endContainer ) + 1;
        endContainer = parent;
    }

    range.setStart( startContainer, startOffset );
    range.setEnd( endContainer, endOffset );
};

// Returns the first block at least partially contained by the range,
// or null if no block is contained by the range.
var getStartBlockOfRange = function ( range ) {
    var container = range.startContainer,
        block;

    // If inline, get the containing block.
    if ( isInline( container ) ) {
        block = getPreviousBlock( container );
    } else if ( isBlock( container ) ) {
        block = container;
    } else {
        block = getNodeBefore( container, range.startOffset );
        block = getNextBlock( block );
    }
    // Check the block actually intersects the range
    return block && isNodeContainedInRange( range, block, true ) ? block : null;
};

// Returns the last block at least partially contained by the range,
// or null if no block is contained by the range.
var getEndBlockOfRange = function ( range ) {
    var container = range.endContainer,
        block, child;

    // If inline, get the containing block.
    if ( isInline( container ) ) {
        block = getPreviousBlock( container );
    } else if ( isBlock( container ) ) {
        block = container;
    } else {
        block = getNodeAfter( container, range.endOffset );
        if ( !block ) {
            block = container.ownerDocument.body;
            while ( child = block.lastChild ) {
                block = child;
            }
        }
        block = getPreviousBlock( block );

    }
    // Check the block actually intersects the range
    return block && isNodeContainedInRange( range, block, true ) ? block : null;
};

var rangeDoesStartAtBlockBoundary = function ( range ) {
    var startContainer = range.startContainer,
        startOffset = range.startOffset,
        parent, child;

    while ( isInline( startContainer ) ) {
        if ( startOffset ) {
            return false;
        }
        parent = startContainer.parentNode;
        startOffset = indexOf.call( parent.childNodes, startContainer );
        startContainer = parent;
    }
    // Skip empty text nodes and <br>s.
    while ( startOffset &&
            ( child = startContainer.childNodes[ startOffset - 1 ] ) &&
            ( child.data === '' || child.nodeName === 'BR' ) ) {
        startOffset -= 1;
    }
    return !startOffset;
};

var rangeDoesEndAtBlockBoundary = function ( range ) {
    var endContainer = range.endContainer,
        endOffset = range.endOffset,
        length = getLength( endContainer ),
        parent, child;

    while ( isInline( endContainer ) ) {
        if ( endOffset !== length ) {
            return false;
        }
        parent = endContainer.parentNode;
        endOffset = indexOf.call( parent.childNodes, endContainer ) + 1;
        endContainer = parent;
        length = endContainer.childNodes.length;
    }
    // Skip empty text nodes and <br>s.
    while ( endOffset < length &&
            ( child = endContainer.childNodes[ endOffset ] ) &&
            ( child.data === '' || child.nodeName === 'BR' ) ) {
        endOffset += 1;
    }
    return endOffset === length;
};

var expandRangeToBlockBoundaries = function ( range ) {
    var start = getStartBlockOfRange( range ),
        end = getEndBlockOfRange( range ),
        parent;

    if ( start && end ) {
        parent = start.parentNode;
        range.setStart( parent, indexOf.call( parent.childNodes, start ) );
        parent = end.parentNode;
        range.setEnd( parent, indexOf.call( parent.childNodes, end ) + 1 );
    }
};
/*global
    DOCUMENT_POSITION_PRECEDING,
    ELEMENT_NODE,
    TEXT_NODE,
    SHOW_ELEMENT,
    SHOW_TEXT,
    FILTER_ACCEPT,
    FILTER_SKIP,
    win,
    isIOS,
    isMac,
    isGecko,
    isIE,
    isIE8,
    isOpera,
    ctrlKey,
    useTextFixer,
    cantFocusEmptyTextNodes,
    losesSelectionOnBlur,
    hasBuggySplit,
    notWS,
    indexOf,

    TreeWalker,

    hasTagAttributes,
    isLeaf,
    isInline,
    isBlock,
    isContainer,
    getPreviousBlock,
    getNextBlock,
    getNearest,
    getPath,
    getLength,
    detach,
    replaceWith,
    empty,
    fixCursor,
    split,
    mergeInlines,
    mergeWithBlock,
    mergeContainers,
    createElement,

    forEachTextNodeInRange,
    getTextContentInRange,
    insertNodeInRange,
    extractContentsOfRange,
    deleteContentsOfRange,
    insertTreeFragmentIntoRange,
    isNodeContainedInRange,
    moveRangeBoundariesDownTree,
    moveRangeBoundariesUpTree,
    getStartBlockOfRange,
    getEndBlockOfRange,
    rangeDoesStartAtBlockBoundary,
    rangeDoesEndAtBlockBoundary,
    expandRangeToBlockBoundaries,

    Range,
    top,
    console,
    setTimeout
*/
/*jshint strict:false */

function Squire ( doc ) {
    var win = doc.defaultView;
    var body = doc.body;
    this._win = win;
    this._doc = doc;
    this._body = body;

    this._events = {};

    this._sel = win.getSelection();
    this._lastSelection = null;

    // IE loses selection state of iframe on blur, so make sure we
    // cache it just before it loses focus.
    if ( losesSelectionOnBlur ) {
        this.addEventListener( 'beforedeactivate', this.getSelection );
    }

    this._placeholderTextNode = null;
    this._mayRemovePlaceholder = true;
    this._willEnablePlaceholderRemoval = false;

    this._lastAnchorNode = null;
    this._lastFocusNode = null;
    this._path = '';

    this.addEventListener( 'keyup', this._updatePathOnEvent );
    this.addEventListener( 'mouseup', this._updatePathOnEvent );

    win.addEventListener( 'focus', this, false );
    win.addEventListener( 'blur', this, false );

    this._undoIndex = -1;
    this._undoStack = [];
    this._undoStackLength = 0;
    this._isInUndoState = false;

    this.addEventListener( 'keyup', this._docWasChanged );

    // IE sometimes fires the beforepaste event twice; make sure it is not run
    // again before our after paste function is called.
    this._awaitingPaste = false;
    this.addEventListener( isIE ? 'beforecut' : 'cut', this._onCut );
    this.addEventListener( isIE ? 'beforepaste' : 'paste', this._onPaste );

    if ( isIE8 ) {
        this.addEventListener( 'keyup', this._ieSelAllClean );
    }
    // Opera does not fire keydown repeatedly.
    this.addEventListener( isOpera ? 'keypress' : 'keydown', this._onKey );

    // Fix IE8/9's buggy implementation of Text#splitText.
    // If the split is at the end of the node, it doesn't insert the newly split
    // node into the document, and sets its value to undefined rather than ''.
    // And even if the split is not at the end, the original node is removed
    // from the document and replaced by another, rather than just having its
    // data shortened.
    if ( hasBuggySplit ) {
        win.Text.prototype.splitText = function ( offset ) {
            var afterSplit = this.ownerDocument.createTextNode(
                    this.data.slice( offset ) ),
                next = this.nextSibling,
                parent = this.parentNode,
                toDelete = this.length - offset;
            if ( next ) {
                parent.insertBefore( afterSplit, next );
            } else {
                parent.appendChild( afterSplit );
            }
            if ( toDelete ) {
                this.deleteData( offset, toDelete );
            }
            return afterSplit;
        };
    }

    body.setAttribute( 'contenteditable', 'true' );
    this.setHTML( '' );
}

var proto = Squire.prototype;

proto.createElement = function ( tag, props, children ) {
    return createElement( this._doc, tag, props, children );
};

proto.didError = function ( error ) {
    console.log( error );
};

proto.getDocument = function () {
    return this._doc;
};

// --- Events ---

// Subscribing to these events won't automatically add a listener to the
// document node, since these events are fired in a custom manner by the
// editor code.
var customEvents = {
    focus: 1, blur: 1,
    pathChange: 1, select: 1, input: 1, undoStateChange: 1
};

proto.fireEvent = function ( type, event ) {
    var handlers = this._events[ type ],
        i, l, obj;
    if ( handlers ) {
        if ( !event ) {
            event = {};
        }
        if ( event.type !== type ) {
            event.type = type;
        }
        // Clone handlers array, so any handlers added/removed do not affect it.
        handlers = handlers.slice();
        for ( i = 0, l = handlers.length; i < l; i += 1 ) {
            obj = handlers[i];
            try {
                if ( obj.handleEvent ) {
                    obj.handleEvent( event );
                } else {
                    obj.call( this, event );
                }
            } catch ( error ) {
                error.details = 'Squire: fireEvent error. Event type: ' + type;
                this.didError( error );
            }
        }
    }
    return this;
};

proto.handleEvent = function ( event ) {
    this.fireEvent( event.type, event );
};

proto.addEventListener = function ( type, fn ) {
    var handlers = this._events[ type ];
    if ( !fn ) {
        this.didError({
            name: 'Squire: addEventListener with null or undefined fn',
            message: 'Event type: ' + type
        });
        return this;
    }
    if ( !handlers ) {
        handlers = this._events[ type ] = [];
        if ( !customEvents[ type ] ) {
            this._doc.addEventListener( type, this, false );
        }
    }
    handlers.push( fn );
    return this;
};

proto.removeEventListener = function ( type, fn ) {
    var handlers = this._events[ type ],
        l;
    if ( handlers ) {
        l = handlers.length;
        while ( l-- ) {
            if ( handlers[l] === fn ) {
                handlers.splice( l, 1 );
            }
        }
        if ( !handlers.length ) {
            delete this._events[ type ];
            if ( !customEvents[ type ] ) {
                this._doc.removeEventListener( type, this, false );
            }
        }
    }
    return this;
};

// --- Selection and Path ---

proto._createRange =
        function ( range, startOffset, endContainer, endOffset ) {
    if ( range instanceof this._win.Range ) {
        return range.cloneRange();
    }
    var domRange = this._doc.createRange();
    domRange.setStart( range, startOffset );
    if ( endContainer ) {
        domRange.setEnd( endContainer, endOffset );
    } else {
        domRange.setEnd( range, startOffset );
    }
    return domRange;
};

proto.setSelection = function ( range ) {
    if ( range ) {
        // iOS bug: if you don't focus the iframe before setting the
        // selection, you can end up in a state where you type but the input
        // doesn't get directed into the contenteditable area but is instead
        // lost in a black hole. Very strange.
        if ( isIOS ) {
            this._win.focus();
        }
        var sel = this._sel;
        sel.removeAllRanges();
        sel.addRange( range );
    }
    return this;
};

proto.getSelection = function () {
    var sel = this._sel;
    if ( sel.rangeCount ) {
        var lastSelection  = this._lastSelection =
            sel.getRangeAt( 0 ).cloneRange();
        var startContainer = lastSelection.startContainer,
            endContainer = lastSelection.endContainer;
        // FF sometimes throws an error reading the isLeaf property. Let's
        // catch and log it to see if we can find what's going on.
        try {
            // FF can return the selection as being inside an <img>. WTF?
            if ( startContainer && isLeaf( startContainer ) ) {
                lastSelection.setStartBefore( startContainer );
            }
            if ( endContainer && isLeaf( endContainer ) ) {
                lastSelection.setEndBefore( endContainer );
            }
        } catch ( error ) {
            this.didError({
                name: 'Squire#getSelection error',
                message: 'Starts: ' + startContainer.nodeName +
                    '\nEnds: ' + endContainer.nodeName
            });
        }
    }
    return this._lastSelection;
};

proto.getSelectedText = function () {
    return getTextContentInRange( this.getSelection() );
};

proto.getPath = function () {
    return this._path;
};

// --- Workaround for browsers that can't focus empty text nodes ---

// WebKit bug: https://bugs.webkit.org/show_bug.cgi?id=15256

proto._enablePlaceholderRemoval = function () {
    this._mayRemovePlaceholder = true;
    this._willEnablePlaceholderRemoval = false;
    this.removeEventListener( 'keydown', this._enablePlaceholderRemoval );
};

proto._removePlaceholderTextNode = function () {
    if ( !this._mayRemovePlaceholder ) { return; }

    var node = this._placeholderTextNode,
        index;

    this._placeholderTextNode = null;

    if ( node.parentNode ) {
        while ( ( index = node.data.indexOf( '\u200B' ) ) > -1 ) {
            node.deleteData( index, 1 );
        }
        if ( !node.data && !node.nextSibling && !node.previousSibling &&
                isInline( node.parentNode ) ) {
            detach( node.parentNode );
        }
    }
};

proto._setPlaceholderTextNode = function ( node ) {
    if ( this._placeholderTextNode ) {
        this._mayRemovePlaceholder = true;
        this._removePlaceholderTextNode();
    }
    if ( !this._willEnablePlaceholderRemoval ) {
        this.addEventListener( 'keydown', this._enablePlaceholderRemoval );
        this._willEnablePlaceholderRemoval = true;
    }
    this._mayRemovePlaceholder = false;
    this._placeholderTextNode = node;
};

// --- Path change events ---

proto._updatePath = function ( range, force ) {
    if ( this._placeholderTextNode && !force ) {
        this._removePlaceholderTextNode( range );
    }
    var anchor = range.startContainer,
        focus = range.endContainer,
        newPath;
    if ( force || anchor !== this._lastAnchorNode ||
            focus !== this._lastFocusNode ) {
        this._lastAnchorNode = anchor;
        this._lastFocusNode = focus;
        newPath = ( anchor && focus ) ? ( anchor === focus ) ?
            getPath( focus ) : '(selection)' : '';
        if ( this._path !== newPath ) {
            this._path = newPath;
            this.fireEvent( 'pathChange', { path: newPath } );
        }
    }
    if ( anchor !== focus ) {
        this.fireEvent( 'select' );
    }
};

proto._updatePathOnEvent = function () {
    this._updatePath( this.getSelection() );
};

// --- Focus ---

proto.focus = function () {
    // FF seems to need the body to be focussed
    // (at least on first load).
    if ( isGecko ) {
        this._body.focus();
    }
    this._win.focus();
    return this;
};

proto.blur = function () {
    // IE will remove the whole browser window from focus if you call
    // win.blur() or body.blur(), so instead we call top.focus() to focus
    // the top frame, thus blurring this frame. This works in everything
    // except FF, so we need to call body.blur() in that as well.
    if ( isGecko ) {
        this._body.blur();
    }
    top.focus();
    return this;
};

// --- Bookmarking ---

var startSelectionId = 'squire-selection-start';
var endSelectionId = 'squire-selection-end';

proto._saveRangeToBookmark = function ( range ) {
    var startNode = this.createElement( 'INPUT', {
            id: startSelectionId,
            type: 'hidden'
        }),
        endNode = this.createElement( 'INPUT', {
            id: endSelectionId,
            type: 'hidden'
        }),
        temp;

    insertNodeInRange( range, startNode );
    range.collapse( false );
    insertNodeInRange( range, endNode );

    // In a collapsed range, the start is sometimes inserted after the end!
    if ( startNode.compareDocumentPosition( endNode ) &
            DOCUMENT_POSITION_PRECEDING ) {
        startNode.id = endSelectionId;
        endNode.id = startSelectionId;
        temp = startNode;
        startNode = endNode;
        endNode = temp;
    }

    range.setStartAfter( startNode );
    range.setEndBefore( endNode );
};

proto._getRangeAndRemoveBookmark = function ( range ) {
    var doc = this._doc,
        start = doc.getElementById( startSelectionId ),
        end = doc.getElementById( endSelectionId );

    if ( start && end ) {
        var startContainer = start.parentNode,
            endContainer = end.parentNode,
            collapsed;

        var _range = {
            startContainer: startContainer,
            endContainer: endContainer,
            startOffset: indexOf.call( startContainer.childNodes, start ),
            endOffset: indexOf.call( endContainer.childNodes, end )
        };

        if ( startContainer === endContainer ) {
            _range.endOffset -= 1;
        }

        detach( start );
        detach( end );

        // Merge any text nodes we split
        mergeInlines( startContainer, _range );
        if ( startContainer !== endContainer ) {
            mergeInlines( endContainer, _range );
        }

        if ( !range ) {
            range = doc.createRange();
        }
        range.setStart( _range.startContainer, _range.startOffset );
        range.setEnd( _range.endContainer, _range.endOffset );
        collapsed = range.collapsed;

        moveRangeBoundariesDownTree( range );
        if ( collapsed ) {
            range.collapse( true );
        }
    }
    return range || null;
};

// --- Undo ---

proto._docWasChanged = function ( event ) {
    var code = event && event.keyCode;
    // Presume document was changed if:
    // 1. A modifier key (other than shift) wasn't held down
    // 2. The key pressed is not in range 16<=x<=20 (control keys)
    // 3. The key pressed is not in range 33<=x<=45 (navigation keys)
    if ( !event || ( !event.ctrlKey && !event.metaKey && !event.altKey &&
            ( code < 16 || code > 20 ) &&
            ( code < 33 || code > 45 ) ) )  {
        if ( this._isInUndoState ) {
            this._isInUndoState = false;
            this.fireEvent( 'undoStateChange', {
                canUndo: true,
                canRedo: false
            });
        }
        this.fireEvent( 'input' );
    }
};

// Leaves bookmark
proto._recordUndoState = function ( range ) {
    // Don't record if we're already in an undo state
    if ( !this._isInUndoState ) {
        // Advance pointer to new position
        var undoIndex = this._undoIndex += 1,
            undoStack = this._undoStack;

        // Truncate stack if longer (i.e. if has been previously undone)
        if ( undoIndex < this._undoStackLength) {
            undoStack.length = this._undoStackLength = undoIndex;
        }

        // Write out data
        if ( range ) {
            this._saveRangeToBookmark( range );
        }
        undoStack[ undoIndex ] = this._getHTML();
        this._undoStackLength += 1;
        this._isInUndoState = true;
    }
};

proto.undo = function () {
    // Sanity check: must not be at beginning of the history stack
    if ( this._undoIndex !== 0 || !this._isInUndoState ) {
        // Make sure any changes since last checkpoint are saved.
        this._recordUndoState( this.getSelection() );

        this._undoIndex -= 1;
        this._setHTML( this._undoStack[ this._undoIndex ] );
        var range = this._getRangeAndRemoveBookmark();
        if ( range ) {
            this.setSelection( range );
        }
        this._isInUndoState = true;
        this.fireEvent( 'undoStateChange', {
            canUndo: this._undoIndex !== 0,
            canRedo: true
        });
        this.fireEvent( 'input' );
    }
    return this;
};

proto.redo = function () {
    // Sanity check: must not be at end of stack and must be in an undo
    // state.
    var undoIndex = this._undoIndex,
        undoStackLength = this._undoStackLength;
    if ( undoIndex + 1 < undoStackLength && this._isInUndoState ) {
        this._undoIndex += 1;
        this._setHTML( this._undoStack[ this._undoIndex ] );
        var range = this._getRangeAndRemoveBookmark();
        if ( range ) {
            this.setSelection( range );
        }
        this.fireEvent( 'undoStateChange', {
            canUndo: true,
            canRedo: undoIndex + 2 < undoStackLength
        });
        this.fireEvent( 'input' );
    }
    return this;
};

// --- Inline formatting ---

// Looks for matching tag and attributes, so won't work
// if <strong> instead of <b> etc.
proto.hasFormat = function ( tag, attributes, range ) {
    // 1. Normalise the arguments and get selection
    tag = tag.toUpperCase();
    if ( !attributes ) { attributes = {}; }
    if ( !range && !( range = this.getSelection() ) ) {
        return false;
    }

    // If the common ancestor is inside the tag we require, we definitely
    // have the format.
    var root = range.commonAncestorContainer,
        walker, node;
    if ( getNearest( root, tag, attributes ) ) {
        return true;
    }

    // If common ancestor is a text node and doesn't have the format, we
    // definitely don't have it.
    if ( root.nodeType === TEXT_NODE ) {
        return false;
    }

    // Otherwise, check each text node at least partially contained within
    // the selection and make sure all of them have the format we want.
    walker = new TreeWalker( root, SHOW_TEXT, function ( node ) {
        return isNodeContainedInRange( range, node, true ) ?
            FILTER_ACCEPT : FILTER_SKIP;
    }, false );

    var seenNode = false;
    while ( node = walker.nextNode() ) {
        if ( !getNearest( node, tag, attributes ) ) {
            return false;
        }
        seenNode = true;
    }

    return seenNode;
};

proto._addFormat = function ( tag, attributes, range ) {
    // If the range is collapsed we simply insert the node by wrapping
    // it round the range and focus it.
    var el, walker, startContainer, endContainer, startOffset, endOffset,
        textnode, needsFormat;

    if ( range.collapsed ) {
        el = fixCursor( this.createElement( tag, attributes ) );
        insertNodeInRange( range, el );
        range.setStart( el.firstChild, el.firstChild.length );
        range.collapse( true );
    }
    // Otherwise we find all the textnodes in the range (splitting
    // partially selected nodes) and if they're not already formatted
    // correctly we wrap them in the appropriate tag.
    else {
        // We don't want to apply formatting twice so we check each text
        // node to see if it has an ancestor with the formatting already.
        // Create an iterator to walk over all the text nodes under this
        // ancestor which are in the range and not already formatted
        // correctly.
        walker = new TreeWalker(
            range.commonAncestorContainer,
            SHOW_TEXT,
            function ( node ) {
                return isNodeContainedInRange( range, node, true ) ?
                    FILTER_ACCEPT : FILTER_SKIP;
            },
            false
        );

        // Start at the beginning node of the range and iterate through
        // all the nodes in the range that need formatting.
        startOffset = 0;
        endOffset = 0;
        textnode = walker.currentNode = range.startContainer;

        if ( textnode.nodeType !== TEXT_NODE ) {
            textnode = walker.nextNode();
        }

        do {
            needsFormat = !getNearest( textnode, tag, attributes );
            if ( textnode === range.endContainer ) {
                if ( needsFormat && textnode.length > range.endOffset ) {
                    textnode.splitText( range.endOffset );
                } else {
                    endOffset = range.endOffset;
                }
            }
            if ( textnode === range.startContainer ) {
                if ( needsFormat && range.startOffset ) {
                    textnode = textnode.splitText( range.startOffset );
                } else {
                    startOffset = range.startOffset;
                }
            }
            if ( needsFormat ) {
                el = this.createElement( tag, attributes );
                replaceWith( textnode, el );
                el.appendChild( textnode );
                endOffset = textnode.length;
            }
            endContainer = textnode;
            if ( !startContainer ) { startContainer = endContainer; }
        } while ( textnode = walker.nextNode() );

        // Now set the selection to as it was before
        range = this._createRange(
            startContainer, startOffset, endContainer, endOffset );
    }
    return range;
};

proto._removeFormat = function ( tag, attributes, range, partial ) {
    // Add bookmark
    this._saveRangeToBookmark( range );

    // We need a node in the selection to break the surrounding
    // formatted text.
    var doc = this._doc,
        fixer;
    if ( range.collapsed ) {
        if ( cantFocusEmptyTextNodes ) {
            fixer = doc.createTextNode( '\u200B' );
            this._setPlaceholderTextNode( fixer );
        } else {
            fixer = doc.createTextNode( '' );
        }
        insertNodeInRange( range, fixer );
    }

    // Find block-level ancestor of selection
    var root = range.commonAncestorContainer;
    while ( isInline( root ) ) {
        root = root.parentNode;
    }

    // Find text nodes inside formatTags that are not in selection and
    // add an extra tag with the same formatting.
    var startContainer = range.startContainer,
        startOffset = range.startOffset,
        endContainer = range.endContainer,
        endOffset = range.endOffset,
        toWrap = [],
        examineNode = function ( node, exemplar ) {
            // If the node is completely contained by the range then
            // we're going to remove all formatting so ignore it.
            if ( isNodeContainedInRange( range, node, false ) ) {
                return;
            }

            var isText = ( node.nodeType === TEXT_NODE ),
                child, next;

            // If not at least partially contained, wrap entire contents
            // in a clone of the tag we're removing and we're done.
            if ( !isNodeContainedInRange( range, node, true ) ) {
                // Ignore bookmarks and empty text nodes
                if ( node.nodeName !== 'INPUT' &&
                        ( !isText || node.data ) ) {
                    toWrap.push([ exemplar, node ]);
                }
                return;
            }

            // Split any partially selected text nodes.
            if ( isText ) {
                if ( node === endContainer && endOffset !== node.length ) {
                    toWrap.push([ exemplar, node.splitText( endOffset ) ]);
                }
                if ( node === startContainer && startOffset ) {
                    node.splitText( startOffset );
                    toWrap.push([ exemplar, node ]);
                }
            }
            // If not a text node, recurse onto all children.
            // Beware, the tree may be rewritten with each call
            // to examineNode, hence find the next sibling first.
            else {
                for ( child = node.firstChild; child; child = next ) {
                    next = child.nextSibling;
                    examineNode( child, exemplar );
                }
            }
        },
        formatTags = Array.prototype.filter.call(
            root.getElementsByTagName( tag ), function ( el ) {
                return isNodeContainedInRange( range, el, true ) &&
                    hasTagAttributes( el, tag, attributes );
            }
        );

    if ( !partial ) {
        formatTags.forEach( function ( node ) {
            examineNode( node, node );
        });
    }

    // Now wrap unselected nodes in the tag
    toWrap.forEach( function ( item ) {
        // [ exemplar, node ] tuple
        var el = item[0].cloneNode( false ),
            node = item[1];
        replaceWith( node, el );
        el.appendChild( node );
    });
    // and remove old formatting tags.
    formatTags.forEach( function ( el ) {
        replaceWith( el, empty( el ) );
    });

    // Merge adjacent inlines:
    this._getRangeAndRemoveBookmark( range );
    if ( fixer ) {
        range.collapse( false );
    }
    var _range = {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset
    };
    mergeInlines( root, _range );
    range.setStart( _range.startContainer, _range.startOffset );
    range.setEnd( _range.endContainer, _range.endOffset );

    return range;
};

proto.changeFormat = function ( add, remove, range, partial ) {
    // Normalise the arguments and get selection
    if ( !range && !( range = this.getSelection() ) ) {
        return;
    }

    // Save undo checkpoint
    this._recordUndoState( range );
    this._getRangeAndRemoveBookmark( range );

    if ( remove ) {
        range = this._removeFormat( remove.tag.toUpperCase(),
            remove.attributes || {}, range, partial );
    }
    if ( add ) {
        range = this._addFormat( add.tag.toUpperCase(),
            add.attributes || {}, range );
    }

    this.setSelection( range );
    this._updatePath( range, true );

    // We're not still in an undo state
    this._docWasChanged();

    return this;
};

// --- Block formatting ---

var tagAfterSplit = {
    DIV: 'DIV',
    PRE: 'DIV',
    H1:  'DIV',
    H2:  'DIV',
    H3:  'DIV',
    H4:  'DIV',
    H5:  'DIV',
    H6:  'DIV',
    P:   'DIV',
    DT:  'DD',
    DD:  'DT',
    LI:  'LI'
};

var splitBlock = function ( block, node, offset ) {
    var splitTag = tagAfterSplit[ block.nodeName ],
        nodeAfterSplit = split( node, offset, block.parentNode );

    // Make sure the new node is the correct type.
    if ( nodeAfterSplit.nodeName !== splitTag ) {
        block = createElement( nodeAfterSplit.ownerDocument, splitTag );
        block.className = nodeAfterSplit.dir === 'rtl' ? 'dir-rtl' : '';
        block.dir = nodeAfterSplit.dir;
        replaceWith( nodeAfterSplit, block );
        block.appendChild( empty( nodeAfterSplit ) );
        nodeAfterSplit = block;
    }
    return nodeAfterSplit;
};

proto.forEachBlock = function ( fn, mutates, range ) {
    if ( !range && !( range = this.getSelection() ) ) {
        return this;
    }

    // Save undo checkpoint
    if ( mutates ) {
        this._recordUndoState( range );
        this._getRangeAndRemoveBookmark( range );
    }

    var start = getStartBlockOfRange( range ),
        end = getEndBlockOfRange( range );
    if ( start && end ) {
        do {
            if ( fn( start ) || start === end ) { break; }
        } while ( start = getNextBlock( start ) );
    }

    if ( mutates ) {
        this.setSelection( range );

        // Path may have changed
        this._updatePath( range, true );

        // We're not still in an undo state
        this._docWasChanged();
    }
    return this;
};

proto.modifyBlocks = function ( modify, range ) {
    if ( !range && !( range = this.getSelection() ) ) {
        return this;
    }
    // 1. Stop firefox adding an extra <BR> to <BODY>
    // if we remove everything. Don't want to do this in Opera
    // as it can cause focus problems.
    var body = this._body;
    if ( !isOpera ) {
        body.setAttribute( 'contenteditable', 'false' );
    }

    // 2. Save undo checkpoint and bookmark selection
    if ( this._isInUndoState ) {
        this._saveRangeToBookmark( range );
    } else {
        this._recordUndoState( range );
    }

    // 3. Expand range to block boundaries
    expandRangeToBlockBoundaries( range );

    // 4. Remove range.
    moveRangeBoundariesUpTree( range, body );
    var frag = extractContentsOfRange( range, body );

    // 5. Modify tree of fragment and reinsert.
    insertNodeInRange( range, modify.call( this, frag ) );

    // 6. Merge containers at edges
    if ( range.endOffset < range.endContainer.childNodes.length ) {
        mergeContainers( range.endContainer.childNodes[ range.endOffset ] );
    }
    mergeContainers( range.startContainer.childNodes[ range.startOffset ] );

    // 7. Make it editable again
    if ( !isOpera ) {
        body.setAttribute( 'contenteditable', 'true' );
    }

    // 8. Restore selection
    this._getRangeAndRemoveBookmark( range );
    this.setSelection( range );
    this._updatePath( range, true );

    // 9. We're not still in an undo state
    this._docWasChanged();

    return this;
};

var increaseBlockQuoteLevel = function ( frag ) {
    return this.createElement( 'BLOCKQUOTE', [
        frag
    ]);
};

var decreaseBlockQuoteLevel = function ( frag ) {
    var blockquotes = frag.querySelectorAll( 'blockquote' );
    Array.prototype.filter.call( blockquotes, function ( el ) {
        return !getNearest( el.parentNode, 'BLOCKQUOTE' );
    }).forEach( function ( el ) {
        replaceWith( el, empty( el ) );
    });
    return frag;
};

var removeBlockQuote = function ( frag ) {
    var blockquotes = frag.querySelectorAll( 'blockquote' ),
        l = blockquotes.length,
        bq;
    while ( l-- ) {
        bq = blockquotes[l];
        replaceWith( bq, empty( bq ) );
    }
    return frag;
};

var makeList = function ( self, nodes, type ) {
    var i, l, node, tag, prev, replacement;
    for ( i = 0, l = nodes.length; i < l; i += 1 ) {
        node = nodes[i];
        tag = node.nodeName;
        if ( isBlock( node ) ) {
            if ( tag !== 'LI' ) {
                replacement = self.createElement( 'LI', {
                    'class': node.dir === 'rtl' ? 'dir-rtl' : '',
                    dir: node.dir
                }, [
                    empty( node )
                ]);
                if ( node.parentNode.nodeName === type ) {
                    replaceWith( node, replacement );
                }
                else if ( ( prev = node.previousSibling ) &&
                        prev.nodeName === type ) {
                    prev.appendChild( replacement );
                    detach( node );
                    i -= 1;
                    l -= 1;
                }
                else {
                    replaceWith(
                        node,
                        self.createElement( type, [
                            replacement
                        ])
                    );
                }
            }
        } else if ( isContainer( node ) ) {
            if ( tag !== type && ( /^[DOU]L$/.test( tag ) ) ) {
                replaceWith( node,
                    self.createElement( type, [ empty( node ) ] )
                );
            } else {
                makeList( self, node.childNodes, type );
            }
        }
    }
};

var makeUnorderedList = function ( frag ) {
    makeList( this, frag.childNodes, 'UL' );
    return frag;
};

var makeOrderedList = function ( frag ) {
    makeList( this, frag.childNodes, 'OL' );
    return frag;
};

var decreaseListLevel = function ( frag ) {
    var lists = frag.querySelectorAll( 'UL, OL' );
    Array.prototype.filter.call( lists, function ( el ) {
        return !getNearest( el.parentNode, 'UL' ) &&
            !getNearest( el.parentNode, 'OL' );
    }).forEach( function ( el ) {
        var frag = empty( el ),
            children = frag.childNodes,
            l = children.length,
            child;
        while ( l-- ) {
            child = children[l];
            if ( child.nodeName === 'LI' ) {
                frag.replaceChild( this.createElement( 'DIV', {
                    'class': child.dir === 'rtl' ? 'dir-rtl' : '',
                    dir: child.dir
                }, [
                    empty( child )
                ]), child );
            }
        }
        replaceWith( el, frag );
    }, this );
    return frag;
};

// --- Clean ---

var linkRegExp = /\b((?:(?:ht|f)tps?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\([^\s()<>]+\))+(?:\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’])|(?:[\w\-.%+]+@(?:[\w\-]+\.)+[A-Z]{2,4}))/i;

var addLinks = function ( frag ) {
    var doc = frag.ownerDocument,
        walker = new TreeWalker( frag, SHOW_TEXT,
                function ( node ) {
            return getNearest( node, 'A' ) ? FILTER_SKIP : FILTER_ACCEPT;
        }, false ),
        node, parts, i, l, text, parent, next;
    while ( node = walker.nextNode() ) {
        parts = node.data.split( linkRegExp );
        l = parts.length;
        if ( l > 1 ) {
            parent = node.parentNode;
            next = node.nextSibling;
            for ( i = 0; i < l; i += 1 ) {
                text = parts[i];
                if ( i ) {
                    if ( i % 2 ) {
                        node = doc.createElement( 'A' );
                        node.textContent = text;
                        node.href = /@/.test( text ) ? 'mailto:' + text :
                            /^(?:ht|f)tps?:/.test( text ) ?
                            text : 'http://' + text;
                    } else {
                        node = doc.createTextNode( text );
                    }
                    if ( next ) {
                        parent.insertBefore( node, next );
                    } else {
                        parent.appendChild( node );
                    }
                } else {
                    node.data = text;
                }
            }
            walker.currentNode = node;
        }
    }
};

var allowedBlock = /^(?:A(?:DDRESS|RTICLE|SIDE)|BLOCKQUOTE|CAPTION|D(?:[DLT]|IV)|F(?:IGURE|OOTER)|H[1-6]|HEADER|L(?:ABEL|EGEND|I)|O(?:L|UTPUT)|P(?:RE)?|SECTION|T(?:ABLE|BODY|D|FOOT|H|HEAD|R)|UL)$/;

var fontSizes = {
    1: 10,
    2: 13,
    3: 16,
    4: 18,
    5: 24,
    6: 32,
    7: 48
};

var spanToSemantic = {
    backgroundColor: {
        regexp: notWS,
        replace: function ( doc, colour ) {
            return createElement( doc, 'SPAN', {
                'class': 'highlight',
                style: 'background-color: ' + colour
            });
        }
    },
    color: {
        regexp: notWS,
        replace: function ( doc, colour ) {
            return createElement( doc, 'SPAN', {
                'class': 'colour',
                style: 'color:' + colour
            });
        }
    },
    fontWeight: {
        regexp: /^bold/i,
        replace: function ( doc ) {
            return createElement( doc, 'B' );
        }
    },
    fontStyle: {
        regexp: /^italic/i,
        replace: function ( doc ) {
            return createElement( doc, 'I' );
        }
    },
    fontFamily: {
        regexp: notWS,
        replace: function ( doc, family ) {
            return createElement( doc, 'SPAN', {
                'class': 'font',
                style: 'font-family:' + family
            });
        }
    },
    fontSize: {
        regexp: notWS,
        replace: function ( doc, size ) {
            return createElement( doc, 'SPAN', {
                'class': 'size',
                style: 'font-size:' + size
            });
        }
    }
};

var stylesRewriters = {
    SPAN: function ( span, parent ) {
        var style = span.style,
            doc = span.ownerDocument,
            attr, converter, css, newTreeBottom, newTreeTop, el;

        for ( attr in spanToSemantic ) {
            converter = spanToSemantic[ attr ];
            css = style[ attr ];
            if ( css && converter.regexp.test( css ) ) {
                el = converter.replace( doc, css );
                if ( newTreeBottom ) {
                    newTreeBottom.appendChild( el );
                }
                newTreeBottom = el;
                if ( !newTreeTop ) {
                    newTreeTop = el;
                }
            }
        }

        if ( newTreeTop ) {
            newTreeBottom.appendChild( empty( span ) );
            parent.replaceChild( newTreeTop, span );
        }

        return newTreeBottom || span;
    },
    STRONG: function ( node, parent ) {
        var el = createElement( node.ownerDocument, 'B' );
        parent.replaceChild( el, node );
        el.appendChild( empty( node ) );
        return el;
    },
    EM: function ( node, parent ) {
        var el = createElement( node.ownerDocument, 'I' );
        parent.replaceChild( el, node );
        el.appendChild( empty( node ) );
        return el;
    },
    FONT: function ( node, parent ) {
        var face = node.face,
            size = node.size,
            doc = node.ownerDocument,
            fontSpan, sizeSpan,
            newTreeBottom, newTreeTop;
        if ( face ) {
            fontSpan = createElement( doc, 'SPAN', {
                'class': 'font',
                style: 'font-family:' + face
            });
        }
        if ( size ) {
            sizeSpan = createElement( doc, 'SPAN', {
                'class': 'size',
                style: 'font-size:' + fontSizes[ size ] + 'px'
            });
            if ( fontSpan ) {
                fontSpan.appendChild( sizeSpan );
            }
        }
        newTreeTop = fontSpan || sizeSpan || createElement( doc, 'SPAN' );
        newTreeBottom = sizeSpan || fontSpan || newTreeTop;
        parent.replaceChild( newTreeTop, node );
        newTreeBottom.appendChild( empty( node ) );
        return newTreeBottom;
    },
    TT: function ( node, parent ) {
        var el = createElement( node.ownerDocument, 'SPAN', {
            'class': 'font',
            style: 'font-family:menlo,consolas,"courier new",monospace'
        });
        parent.replaceChild( el, node );
        el.appendChild( empty( node ) );
        return el;
    }
};

var removeEmptyInlines = function ( root ) {
    var children = root.childNodes,
        l = children.length,
        child;
    while ( l-- ) {
        child = children[l];
        if ( child.nodeType === ELEMENT_NODE && child.nodeName !== 'IMG' ) {
            removeEmptyInlines( child );
            if ( isInline( child ) && !child.firstChild ) {
                root.removeChild( child );
            }
        }
    }
};

/*
    Two purposes:

    1. Remove nodes we don't want, such as weird <o:p> tags, comment nodes
       and whitespace nodes.
    2. Convert inline tags into our preferred format.
*/
var cleanTree = function ( node, allowStyles ) {
    var children = node.childNodes,
        i, l, child, nodeName, nodeType, rewriter, childLength;
    for ( i = 0, l = children.length; i < l; i += 1 ) {
        child = children[i];
        nodeName = child.nodeName;
        nodeType = child.nodeType;
        rewriter = stylesRewriters[ nodeName ];
        if ( nodeType === ELEMENT_NODE ) {
            childLength = child.childNodes.length;
            if ( rewriter ) {
                child = rewriter( child, node );
            } else if ( !allowedBlock.test( nodeName ) &&
                    !isInline( child ) ) {
                i -= 1;
                l += childLength - 1;
                node.replaceChild( empty( child ), child );
                continue;
            } else if ( !allowStyles && child.style.cssText ) {
                child.removeAttribute( 'style' );
            }
            if ( childLength ) {
                cleanTree( child, allowStyles );
            }
        } else if ( nodeType !== TEXT_NODE || (
                !( notWS.test( child.data ) ) &&
                !( i > 0 && isInline( children[ i - 1 ] ) ) &&
                !( i + 1 < l && isInline( children[ i + 1 ] ) )
                ) ) {
            node.removeChild( child );
            i -= 1;
            l -= 1;
        }
    }
    return node;
};

var wrapTopLevelInline = function ( root, tag ) {
    var children = root.childNodes,
        doc = root.ownerDocument,
        wrapper = null,
        i, l, child, isBR;
    for ( i = 0, l = children.length; i < l; i += 1 ) {
        child = children[i];
        isBR = child.nodeName === 'BR';
        if ( !isBR && isInline( child ) ) {
            if ( !wrapper ) { wrapper = createElement( doc, tag ); }
            wrapper.appendChild( child );
            i -= 1;
            l -= 1;
        } else if ( isBR || wrapper ) {
            if ( !wrapper ) { wrapper = createElement( doc, tag ); }
            fixCursor( wrapper );
            if ( isBR ) {
                root.replaceChild( wrapper, child );
            } else {
                root.insertBefore( wrapper, child );
                i += 1;
                l += 1;
            }
            wrapper = null;
        }
    }
    if ( wrapper ) {
        root.appendChild( fixCursor( wrapper ) );
    }
    return root;
};

var notWSTextNode = function ( node ) {
    return ( node.nodeType === ELEMENT_NODE ?
        node.nodeName === 'BR' :
        notWS.test( node.data ) ) ?
        FILTER_ACCEPT : FILTER_SKIP;
};
var isLineBreak = function ( br ) {
    var block = br.parentNode,
        walker;
    while ( isInline( block ) ) {
        block = block.parentNode;
    }
    walker = new TreeWalker(
        block, SHOW_ELEMENT|SHOW_TEXT, notWSTextNode );
    walker.currentNode = br;
    return !!walker.nextNode();
};

// <br> elements are treated specially, and differently depending on the
// browser, when in rich text editor mode. When adding HTML from external
// sources, we must remove them, replacing the ones that actually affect
// line breaks with a split of the block element containing it (and wrapping
// any not inside a block). Browsers that want <br> elements at the end of
// each block will then have them added back in a later fixCursor method
// call.
var cleanupBRs = function ( root ) {
    var brs = root.querySelectorAll( 'BR' ),
        brBreaksLine = [],
        l = brs.length,
        i, br, block;

    // Must calculate whether the <br> breaks a line first, because if we
    // have two <br>s next to each other, after the first one is converted
    // to a block split, the second will be at the end of a block and
    // therefore seem to not be a line break. But in its original context it
    // was, so we should also convert it to a block split.
    for ( i = 0; i < l; i += 1 ) {
        brBreaksLine[i] = isLineBreak( brs[i] );
    }
    while ( l-- ) {
        br = brs[l];
        // Cleanup may have removed it
        block = br.parentNode;
        if ( !block ) { continue; }
        while ( isInline( block ) ) {
            block = block.parentNode;
        }
        // If this is not inside a block, replace it by wrapping
        // inlines in DIV.
        if ( !isBlock( block ) || !tagAfterSplit[ block.nodeName ] ) {
            wrapTopLevelInline( block, 'DIV' );
        }
        // If in a block we can split, split it instead, but only if there
        // is actual text content in the block. Otherwise, the <br> is a
        // placeholder to stop the block from collapsing, so we must leave
        // it.
        else {
            if ( brBreaksLine[l] ) {
                splitBlock( block, br.parentNode, br );
            }
            detach( br );
        }
    }
};

// --- Cut and Paste ---

proto._onCut = function () {
    // Save undo checkpoint
    var range = this.getSelection();
    var self = this;
    this._recordUndoState( range );
    this._getRangeAndRemoveBookmark( range );
    this.setSelection( range );
    setTimeout( function () {
        try {
            // If all content removed, ensure div at start of body.
            fixCursor( self._body );
        } catch ( error ) {
            self.didError( error );
        }
    }, 0 );
};

proto._onPaste = function ( event ) {
    if ( this._awaitingPaste ) { return; }

    // Treat image paste as a drop of an image file.
    var clipboardData = event.clipboardData,
        items = clipboardData && clipboardData.items,
        fireDrop = false,
        hasImage = false,
        l, type;
    if ( items ) {
        l = items.length;
        while ( l-- ) {
            type = items[l].type;
            if ( type === 'text/html' ) {
                hasImage = false;
                break;
            }
            if ( /^image\/.*/.test( type ) ) {
                hasImage = true;
            }
        }
        if ( hasImage ) {
            event.preventDefault();
                this.fireEvent( 'dragover', {
                dataTransfer: clipboardData,
                /*jshint loopfunc: true */
                preventDefault: function () {
                    fireDrop = true;
                }
                /*jshint loopfunc: false */
            });
            if ( fireDrop ) {
                this.fireEvent( 'drop', {
                    dataTransfer: clipboardData
                });
            }
            return;
        }
    }

    this._awaitingPaste = true;

    var self = this,
        body = this._body,
        range = this.getSelection(),
        startContainer = range.startContainer,
        startOffset = range.startOffset,
        endContainer = range.endContainer,
        endOffset = range.endOffset;

    var pasteArea = this.createElement( 'DIV', {
        style: 'position: absolute; overflow: hidden; top:' +
            (body.scrollTop + 30) + 'px; left: 0; width: 1px; height: 1px;'
    });
    body.appendChild( pasteArea );
    range.selectNodeContents( pasteArea );
    this.setSelection( range );

    // A setTimeout of 0 means this is added to the back of the
    // single javascript thread, so it will be executed after the
    // paste event.
    setTimeout( function () {
        try {
            // Get the pasted content and clean
            var frag = empty( detach( pasteArea ) ),
                first = frag.firstChild,
                range = self._createRange(
                    startContainer, startOffset, endContainer, endOffset );

            // Was anything actually pasted?
            if ( first ) {
                // Safari and IE like putting extra divs around things.
                if ( first === frag.lastChild &&
                        first.nodeName === 'DIV' ) {
                    frag.replaceChild( empty( first ), first );
                }

                frag.normalize();
                addLinks( frag );
                cleanTree( frag, false );
                cleanupBRs( frag );
                removeEmptyInlines( frag );

                var node = frag,
                    doPaste = true;
                while ( node = getNextBlock( node ) ) {
                    fixCursor( node );
                }

                self.fireEvent( 'willPaste', {
                    fragment: frag,
                    preventDefault: function () {
                        doPaste = false;
                    }
                });

                // Insert pasted data
                if ( doPaste ) {
                    insertTreeFragmentIntoRange( range, frag );
                    self._docWasChanged();

                    range.collapse( false );
                }
            }

            self.setSelection( range );
            self._updatePath( range, true );

            self._awaitingPaste = false;
        } catch ( error ) {
            self.didError( error );
        }
    }, 0 );
};

// --- Keyboard interaction ---

var keys = {
    8: 'backspace',
    9: 'tab',
    13: 'enter',
    32: 'space',
    37: 'left',
    39: 'right',
    46: 'delete'
};

var mapKeyTo = function ( method ) {
    return function ( self, event ) {
        event.preventDefault();
        self[ method ]();
    };
};

var mapKeyToFormat = function ( tag ) {
    return function ( self, event ) {
        event.preventDefault();
        var range = self.getSelection();
        if ( self.hasFormat( tag, null, range ) ) {
            self.changeFormat( null, { tag: tag }, range );
        } else {
            self.changeFormat( { tag: tag }, null, range );
        }
    };
};

// If you delete the content inside a span with a font styling, Webkit will
// replace it with a <font> tag (!). If you delete all the text inside a
// link in Opera, it won't delete the link. Let's make things consistent. If
// you delete all text inside an inline tag, remove the inline tag.
var afterDelete = function ( self ) {
    try {
        var range = self.getSelection(),
            node = range.startContainer,
            parent;
        if ( node.nodeType === TEXT_NODE ) {
            node = node.parentNode;
        }
        // If focussed in empty inline element
        if ( isInline( node ) && !node.textContent ) {
            do {
                parent = node.parentNode;
            } while ( isInline( parent ) &&
                !parent.textContent && ( node = parent ) );
            range.setStart( parent,
                indexOf.call( parent.childNodes, node ) );
            range.collapse( true );
            parent.removeChild( node );
            if ( !isBlock( parent ) ) {
                parent = getPreviousBlock( parent );
            }
            fixCursor( parent );
            moveRangeBoundariesDownTree( range );
            self.setSelection( range );
            self._updatePath( range );
        }
    } catch ( error ) {
        self.didError( error );
    }
};

// If you select all in IE8 then type, it makes a P; replace it with
// a DIV.
if ( isIE8 ) {
    proto._ieSelAllClean = function () {
        var firstChild = this._body.firstChild;
        if ( firstChild.nodeName === 'P' ) {
            this._saveRangeToBookmark( this.getSelection() );
            replaceWith( firstChild, this.createElement( 'DIV', [
                empty( firstChild )
            ]) );
            this.setSelection( this._getRangeAndRemoveBookmark() );
        }
    };
}

var keyHandlers = {
    enter: function ( self, event ) {
        // We handle this ourselves
        event.preventDefault();

        // Must have some form of selection
        var range = self.getSelection();
        if ( !range ) { return; }

        // Save undo checkpoint and add any links in the preceding section.
        self._recordUndoState( range );
        addLinks( range.startContainer );
        self._getRangeAndRemoveBookmark( range );

        // Selected text is overwritten, therefore delete the contents
        // to collapse selection.
        if ( !range.collapsed ) {
            deleteContentsOfRange( range );
        }

        var block = getStartBlockOfRange( range ),
            tag = block ? block.nodeName : 'DIV',
            splitTag = tagAfterSplit[ tag ],
            nodeAfterSplit;

        // If this is a malformed bit of document, just play it safe
        // and insert a <br>.
        if ( !block ) {
            insertNodeInRange( range, self.createElement( 'BR' ) );
            range.collapse( false );
            self.setSelection( range );
            self._updatePath( range, true );
            self._docWasChanged();
            return;
        }

        // We need to wrap the contents in divs.
        var splitNode = range.startContainer,
            splitOffset = range.startOffset,
            replacement;
        if ( !splitTag ) {
            // If the selection point is inside the block, we're going to
            // rewrite it so our saved referece points won't be valid.
            // Pick a node at a deeper point in the tree to avoid this.
            if ( splitNode === block ) {
                splitNode = splitOffset ?
                    splitNode.childNodes[ splitOffset - 1 ] : null;
                splitOffset = 0;
                if ( splitNode ) {
                    if ( splitNode.nodeName === 'BR' ) {
                        splitNode = splitNode.nextSibling;
                    } else {
                        splitOffset = getLength( splitNode );
                    }
                    if ( !splitNode || splitNode.nodeName === 'BR' ) {
                        replacement = fixCursor( self.createElement( 'DIV' ) );
                        if ( splitNode ) {
                            block.replaceChild( replacement, splitNode );
                        } else {
                            block.appendChild( replacement );
                        }
                        splitNode = replacement;
                    }
                }
            }
            wrapTopLevelInline( block, 'DIV' );
            splitTag = 'DIV';
            if ( !splitNode ) {
                splitNode = block.firstChild;
            }
            range.setStart( splitNode, splitOffset );
            range.setEnd( splitNode, splitOffset );
            block = getStartBlockOfRange( range );
        }

        if ( !block.textContent ) {
            // Break list
            if ( getNearest( block, 'UL' ) || getNearest( block, 'OL' ) ) {
                return self.modifyBlocks( decreaseListLevel, range );
            }
            // Break blockquote
            else if ( getNearest( block, 'BLOCKQUOTE' ) ) {
                return self.modifyBlocks( removeBlockQuote, range );
            }
        }

        // Otherwise, split at cursor point.
        nodeAfterSplit = splitBlock( block, splitNode, splitOffset );

        // Focus cursor
        // If there's a <b>/<i> etc. at the beginning of the split
        // make sure we focus inside it.
        while ( nodeAfterSplit.nodeType === ELEMENT_NODE ) {
            var child = nodeAfterSplit.firstChild,
                next;

            // Don't continue links over a block break; unlikely to be the
            // desired outcome.
            if ( nodeAfterSplit.nodeName === 'A' ) {
                replaceWith( nodeAfterSplit, empty( nodeAfterSplit ) );
                nodeAfterSplit = child;
                continue;
            }

            while ( child && child.nodeType === TEXT_NODE && !child.data ) {
                next = child.nextSibling;
                if ( !next || next.nodeName === 'BR' ) {
                    break;
                }
                detach( child );
                child = next;
            }

            // 'BR's essentially don't count; they're a browser hack.
            // If you try to select the contents of a 'BR', FF will not let
            // you type anything!
            if ( !child || child.nodeName === 'BR' ||
                    ( child.nodeType === TEXT_NODE && !isOpera ) ) {
                break;
            }
            nodeAfterSplit = child;
        }
        range = self._createRange( nodeAfterSplit, 0 );
        self.setSelection( range );
        self._updatePath( range, true );

        // Scroll into view
        if ( nodeAfterSplit.nodeType === TEXT_NODE ) {
            nodeAfterSplit = nodeAfterSplit.parentNode;
        }
        var doc = self._doc,
            body = self._body;
        if ( nodeAfterSplit.offsetTop + nodeAfterSplit.offsetHeight >
                ( doc.documentElement.scrollTop || body.scrollTop ) +
                body.offsetHeight ) {
            nodeAfterSplit.scrollIntoView( false );
        }

        // We're not still in an undo state
        self._docWasChanged();
    },
    backspace: function ( self, event ) {
        var range = self.getSelection();
        // If not collapsed, delete contents
        if ( !range.collapsed ) {
            self._recordUndoState( range );
            self._getRangeAndRemoveBookmark( range );
            event.preventDefault();
            deleteContentsOfRange( range );
            self.setSelection( range );
            self._updatePath( range, true );
        }
        // If at beginning of block, merge with previous
        else if ( rangeDoesStartAtBlockBoundary( range ) ) {
            self._recordUndoState( range );
            self._getRangeAndRemoveBookmark( range );
            event.preventDefault();
            var current = getStartBlockOfRange( range ),
                previous = current && getPreviousBlock( current );
            // Must not be at the very beginning of the text area.
            if ( previous ) {
                // If not editable, just delete whole block.
                if ( !previous.isContentEditable ) {
                    detach( previous );
                    return;
                }
                // Otherwise merge.
                mergeWithBlock( previous, current, range );
                // If deleted line between containers, merge newly adjacent
                // containers.
                current = previous.parentNode;
                while ( current && !current.nextSibling ) {
                    current = current.parentNode;
                }
                if ( current && ( current = current.nextSibling ) ) {
                    mergeContainers( current );
                }
                self.setSelection( range );
            }
            // If at very beginning of text area, allow backspace
            // to break lists/blockquote.
            else if ( current ) {
                // Break list
                if ( getNearest( current, 'UL' ) ||
                        getNearest( current, 'OL' ) ) {
                    return self.modifyBlocks( decreaseListLevel, range );
                }
                // Break blockquote
                else if ( getNearest( current, 'BLOCKQUOTE' ) ) {
                    return self.modifyBlocks( decreaseBlockQuoteLevel, range );
                }
                self.setSelection( range );
                self._updatePath( range, true );
            }
        }
        // Otherwise, leave to browser but check afterwards whether it has
        // left behind an empty inline tag.
        else {
            var text = range.startContainer.data || '';
            if ( !notWS.test( text.charAt( range.startOffset - 1 ) ) ) {
                self._recordUndoState( range );
                self._getRangeAndRemoveBookmark( range );
                self.setSelection( range );
            }
            setTimeout( function () { afterDelete( self ); }, 0 );
        }
    },
    'delete': function ( self, event ) {
        var range = self.getSelection();
        // If not collapsed, delete contents
        if ( !range.collapsed ) {
            self._recordUndoState( range );
            self._getRangeAndRemoveBookmark( range );
            event.preventDefault();
            deleteContentsOfRange( range );
            self.setSelection( range );
            self._updatePath( range, true );
        }
        // If at end of block, merge next into this block
        else if ( rangeDoesEndAtBlockBoundary( range ) ) {
            self._recordUndoState( range );
            self._getRangeAndRemoveBookmark( range );
            event.preventDefault();
            var current = getStartBlockOfRange( range ),
                next = current && getNextBlock( current );
            // Must not be at the very end of the text area.
            if ( next ) {
                // If not editable, just delete whole block.
                if ( !next.isContentEditable ) {
                    detach( next );
                    return;
                }
                // Otherwise merge.
                mergeWithBlock( current, next, range );
                // If deleted line between containers, merge newly adjacent
                // containers.
                next = current.parentNode;
                while ( next && !next.nextSibling ) {
                    next = next.parentNode;
                }
                if ( next && ( next = next.nextSibling ) ) {
                    mergeContainers( next );
                }
                self.setSelection( range );
                self._updatePath( range, true );
            }
        }
        // Otherwise, leave to browser but check afterwards whether it has
        // left behind an empty inline tag.
        else {
            // Record undo point if deleting whitespace
            var text = range.startContainer.data || '';
            if ( !notWS.test( text.charAt( range.startOffset ) ) ) {
                self._recordUndoState( range );
                self._getRangeAndRemoveBookmark( range );
                self.setSelection( range );
            }
            setTimeout( function () { afterDelete( self ); }, 0 );
        }
    },
    space: function ( self ) {
        var range = self.getSelection();
        self._recordUndoState( range );
        addLinks( range.startContainer );
        self._getRangeAndRemoveBookmark( range );
        self.setSelection( range );
    }
};
// Firefox incorrectly handles Cmd-left/Cmd-right on Mac:
// it goes back/forward in history! Override to do the right
// thing.
// https://bugzilla.mozilla.org/show_bug.cgi?id=289384
if ( isMac && isGecko && win.getSelection().modify ) {
    keyHandlers[ 'meta-left' ] = function ( self, event ) {
        event.preventDefault();
        self._sel.modify( 'move', 'backward', 'lineboundary' );
    };
    keyHandlers[ 'meta-right' ] = function ( self, event ) {
        event.preventDefault();
        self._sel.modify( 'move', 'forward', 'lineboundary' );
    };
}

keyHandlers[ ctrlKey + 'b' ] = mapKeyToFormat( 'B' );
keyHandlers[ ctrlKey + 'i' ] = mapKeyToFormat( 'I' );
keyHandlers[ ctrlKey + 'u' ] = mapKeyToFormat( 'U' );
keyHandlers[ ctrlKey + 'y' ] = mapKeyTo( 'redo' );
keyHandlers[ ctrlKey + 'z' ] = mapKeyTo( 'undo' );
keyHandlers[ ctrlKey + 'shift-z' ] = mapKeyTo( 'redo' );

// Ref: http://unixpapa.com/js/key.html
proto._onKey = function ( event ) {
    var code = event.keyCode,
        key = keys[ code ] || String.fromCharCode( code ).toLowerCase(),
        modifiers = '';

    // On keypress, delete and '.' both have event.keyCode 46
    // Must check event.which to differentiate.
    if ( isOpera && event.which === 46 ) {
        key = '.';
    }

    // Function keys
    if ( 111 < code && code < 124 ) {
        key = 'f' + ( code - 111 );
    }

    if ( event.altKey ) { modifiers += 'alt-'; }
    if ( event.ctrlKey ) { modifiers += 'ctrl-'; }
    if ( event.metaKey ) { modifiers += 'meta-'; }
    if ( event.shiftKey ) { modifiers += 'shift-'; }

    key = modifiers + key;

    if ( keyHandlers[ key ] ) {
        keyHandlers[ key ]( this, event );
    }
};

// --- Get/Set data ---

proto._getHTML = function () {
    return this._body.innerHTML;
};

proto._setHTML = function ( html ) {
    var node = this._body;
    node.innerHTML = html;
    do {
        fixCursor( node );
    } while ( node = getNextBlock( node ) );
};

proto.getHTML = function ( withBookMark ) {
    var brs = [],
        node, fixer, html, l, range;
    if ( withBookMark && ( range = this.getSelection() ) ) {
        this._saveRangeToBookmark( range );
    }
    if ( useTextFixer ) {
        node = this._body;
        while ( node = getNextBlock( node ) ) {
            if ( !node.textContent && !node.querySelector( 'BR' ) ) {
                fixer = this.createElement( 'BR' );
                node.appendChild( fixer );
                brs.push( fixer );
            }
        }
    }
    html = this._getHTML();
    if ( useTextFixer ) {
        l = brs.length;
        while ( l-- ) {
            detach( brs[l] );
        }
    }
    if ( range ) {
        this._getRangeAndRemoveBookmark( range );
    }
    return html;
};

proto.setHTML = function ( html ) {
    var frag = this._doc.createDocumentFragment(),
        div = this.createElement( 'DIV' ),
        child;

    // Parse HTML into DOM tree
    div.innerHTML = html;
    frag.appendChild( empty( div ) );

    cleanTree( frag, true );
    cleanupBRs( frag );

    wrapTopLevelInline( frag, 'DIV' );

    // Fix cursor
    var node = frag;
    while ( node = getNextBlock( node ) ) {
        fixCursor( node );
    }

    // Remove existing body children
    var body = this._body;
    while ( child = body.lastChild ) {
        body.removeChild( child );
    }

    // And insert new content
    body.appendChild( frag );
    fixCursor( body );

    // Reset the undo stack
    this._undoIndex = -1;
    this._undoStack.length = 0;
    this._undoStackLength = 0;
    this._isInUndoState = false;

    // Record undo state
    var range = this._getRangeAndRemoveBookmark() ||
        this._createRange( body.firstChild, 0 );
    this._recordUndoState( range );
    this._getRangeAndRemoveBookmark( range );
    // IE will also set focus when selecting text so don't use
    // setSelection. Instead, just store it in lastSelection, so if
    // anything calls getSelection before first focus, we have a range
    // to return.
    if ( losesSelectionOnBlur ) {
        this._lastSelection = range;
    } else {
        this.setSelection( range );
    }
    this._updatePath( range, true );

    return this;
};

proto.insertElement = function ( el, range ) {
    if ( !range ) { range = this.getSelection(); }
    range.collapse( true );
    if ( isInline( el ) ) {
        insertNodeInRange( range, el );
        range.setStartAfter( el );
    } else {
        // Get containing block node.
        var body = this._body,
            splitNode = getStartBlockOfRange( range ) || body,
            parent, nodeAfterSplit;
        // While at end of container node, move up DOM tree.
        while ( splitNode !== body && !splitNode.nextSibling ) {
            splitNode = splitNode.parentNode;
        }
        // If in the middle of a container node, split up to body.
        if ( splitNode !== body ) {
            parent = splitNode.parentNode;
            nodeAfterSplit = split( parent, splitNode.nextSibling, body );
        }
        if ( nodeAfterSplit ) {
            body.insertBefore( el, nodeAfterSplit );
            range.setStart( nodeAfterSplit, 0 );
            range.setStart( nodeAfterSplit, 0 );
            moveRangeBoundariesDownTree( range );
        } else {
            body.appendChild( el );
            // Insert blank line below block.
            body.appendChild( fixCursor( this.createElement( 'div' ) ) );
            range.setStart( el, 0 );
            range.setEnd( el, 0 );
        }
        this.focus();
        this.setSelection( range );
        this._updatePath( range );
    }
    return this;
};

proto.insertImage = function ( src ) {
    var img = this.createElement( 'IMG', {
        src: src
    });
    this.insertElement( img );
    return img;
};

// --- Formatting ---

var command = function ( method, arg, arg2 ) {
    return function () {
        this[ method ]( arg, arg2 );
        return this.focus();
    };
};

proto.addStyles = function ( styles ) {
    if ( styles ) {
        var head = this._doc.documentElement.firstChild,
            style = this.createElement( 'STYLE', {
                type: 'text/css'
            });
        if ( style.styleSheet ) {
            // IE8: must append to document BEFORE adding styles
            // or you get the IE7 CSS parser!
            head.appendChild( style );
            style.styleSheet.cssText = styles;
        } else {
            // Everyone else
            style.appendChild( this._doc.createTextNode( styles ) );
            head.appendChild( style );
        }
    }
    return this;
};

proto.bold = command( 'changeFormat', { tag: 'B' } );
proto.italic = command( 'changeFormat', { tag: 'I' } );
proto.underline = command( 'changeFormat', { tag: 'U' } );

proto.removeBold = command( 'changeFormat', null, { tag: 'B' } );
proto.removeItalic = command( 'changeFormat', null, { tag: 'I' } );
proto.removeUnderline = command( 'changeFormat', null, { tag: 'U' } );

proto.makeLink = function ( url ) {
    url = encodeURI( url );
    var range = this.getSelection();
    if ( range.collapsed ) {
        var protocolEnd = url.indexOf( ':' ) + 1;
        if ( protocolEnd ) {
            while ( url[ protocolEnd ] === '/' ) { protocolEnd += 1; }
        }
        insertNodeInRange(
            range,
            this._doc.createTextNode( url.slice( protocolEnd ) )
        );
    }
    this.changeFormat({
        tag: 'A',
        attributes: {
            href: url
        }
    }, {
        tag: 'A'
    }, range );
    return this.focus();
};
proto.removeLink = function () {
    this.changeFormat( null, {
        tag: 'A'
    }, this.getSelection(), true );
    return this.focus();
};

proto.setFontFace = function ( name ) {
    this.changeFormat({
        tag: 'SPAN',
        attributes: {
            'class': 'font',
            style: 'font-family: ' + name + ', sans-serif;'
        }
    }, {
        tag: 'SPAN',
        attributes: { 'class': 'font' }
    });
    return this.focus();
};
proto.setFontSize = function ( size ) {
    this.changeFormat({
        tag: 'SPAN',
        attributes: {
            'class': 'size',
            style: 'font-size: ' +
                ( typeof size === 'number' ? size + 'px' : size )
        }
    }, {
        tag: 'SPAN',
        attributes: { 'class': 'size' }
    });
    return this.focus();
};

proto.setTextColour = function ( colour ) {
    this.changeFormat({
        tag: 'SPAN',
        attributes: {
            'class': 'colour',
            style: 'color: ' + colour
        }
    }, {
        tag: 'SPAN',
        attributes: { 'class': 'colour' }
    });
    return this.focus();
};

proto.setHighlightColour = function ( colour ) {
    this.changeFormat({
        tag: 'SPAN',
        attributes: {
            'class': 'highlight',
            style: 'background-color: ' + colour
        }
    }, {
        tag: 'SPAN',
        attributes: { 'class': 'highlight' }
    });
    return this.focus();
};

proto.setTextAlignment = function ( alignment ) {
    this.forEachBlock( function ( block ) {
        block.className = ( block.className
            .split( /\s+/ )
            .filter( function ( klass ) {
                return !( /align/.test( klass ) );
            })
            .join( ' ' ) +
            ' align-' + alignment ).trim();
        block.style.textAlign = alignment;
    }, true );
    return this.focus();
};

proto.setTextDirection = function ( direction ) {
    this.forEachBlock( function ( block ) {
        block.className = ( block.className
            .split( /\s+/ )
            .filter( function ( klass ) {
                return !( /dir/.test( klass ) );
            })
            .join( ' ' ) +
            ' dir-' + direction ).trim();
        block.dir = direction;
    }, true );
    return this.focus();
};

proto.increaseQuoteLevel = command( 'modifyBlocks', increaseBlockQuoteLevel );
proto.decreaseQuoteLevel = command( 'modifyBlocks', decreaseBlockQuoteLevel );

proto.makeUnorderedList = command( 'modifyBlocks', makeUnorderedList );
proto.makeOrderedList = command( 'modifyBlocks', makeOrderedList );
proto.removeList = command( 'modifyBlocks', decreaseListLevel );
/*global top, win, doc, Squire */

if ( top !== win ) {
    win.editor = new Squire( doc );
    if ( win.onEditorLoad ) {
        win.onEditorLoad( win.editor );
        win.onEditorLoad = null;
    }
} else {
    win.Squire = Squire;
}

}( document ) );
