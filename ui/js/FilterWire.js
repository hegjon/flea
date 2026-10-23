.pragma library
.import "Filter.js" as Filter

// The filter's backend half (issue 315). ui/js/Filter.js narrows the rows the pane holds on the keystroke
// itself and never reaches ui/Backend.qml; this asks the backend to test the whole folder's names, which
// it already holds, and takes the two answers back: the matches as runs, and one view window of their
// rows, stat'd for the screen and nothing else (rule 1). The held window stays what it was, so a folder
// the pane holds whole is answered on the keystroke and asks nothing. docs/protocol.md "filter".

// ui/Pane.qml onFilterQueryChanged. Each keystroke takes a new gen, so a late answer names the keystroke
// it is for; an empty query closes the standing one. Over a listing still out, relisted below asks.
function ask(pane) {
    if (pane.filterQuery.length === 0) {
        pane.backend.filterClose()
        drop(pane)
        return false
    }
    if (pane.rows.length >= pane.total) {
        drop(pane)
        return false
    }
    if (pane.listInFlight) return false
    pane.filterGen += 1
    pane.filterAskedFor = pane.backend.heldListing
    pane.backend.filter(pane.filterQuery, pane.filterGen, askStart(pane), pane.windowSize)
    return true
}

function drop(pane) {
    pane.filterAskedFor = -1
    if (pane.filterAnswer !== null) pane.filterAnswer = null
    if (pane.filterRows.length > 0) {
        pane.filterHeld = 0
        pane.filterRows = []
        pane.filterKinds = []
    }
}

// Where an answer's first window starts: around the cursor's view position in what is shown now, the
// way the listing's own first window sits around the cursor, so the common keystroke lands with its rows.
function askStart(pane) {
    var view = Filter.viewOf(pane.shown, pane.cursorIndex)
    return Math.max(0, (view < 0 ? 0 : view) - pane.buffer)
}

// A reply is for the standing query only while its gen is the newest and its numbering the one held.
function current(pane, gen, listing) {
    return pane.filterQuery.length > 0 && gen === pane.filterGen && listing === pane.backend.heldListing
}

// ui/PaneWire.qml onFiltered: the folder's answer. The selection loses what the folder hides, a cursor the
// folder hides takes the first row shown, and the view follows the cursor's view position, which the
// matches ahead of the held window moved.
function answered(pane, gen, total, runs, listing) {
    if (!current(pane, gen, listing)) return false
    var list = expand(runs)
    pane.filterAnswer = { gen: gen, listing: listing, query: pane.filterQuery, list: list }
    Filter.prune(pane, list, null)
    if (list.length > 0) {
        if (Filter.viewOf(list, pane.cursorIndex) < 0) {
            pane.cursorIndex = list[0]
            pane.cursorSeq += 1
        }
        pane.showRow(Filter.viewOf(list, pane.cursorIndex))
    }
    return true
}

// ui/PaneWire.qml onFilterRows: one view window of the matched rows, with the Kind dictionary its rows index.
function windowed(pane, start, items, kinds, listing, gen) {
    if (!current(pane, gen, listing)) return false
    pane.filterHeld = start
    pane.filterRows = items
    pane.filterKinds = kinds
    return true
}

// [start, length] runs back into the listing rows they stand for, ascending, which is the order shown keeps.
function expand(runs) {
    var out = []
    for (var i = 0; i < runs.length; i++)
        for (var j = 0; j < runs[i][1]; j++) out.push(runs[i][0] + j)
    return out
}

// ui/Pane.qml's shown: the folder's answer while it is for the standing query, else the held rows' own
// subsequence, which is the whole answer when the pane holds the folder whole and the first answer otherwise.
function standing(answer, rows, held, query) {
    if (query.length > 0 && answer !== null && answer.query === query) return answer.list
    return Filter.shown(rows, held, query)
}

// ui/Pane.qml rowFor's second look: the row the filter window holds for a listing row the held window does
// not. The window is in view space, so the row's own r must name the listing row back.
function rowAt(pane, index) {
    // A test's stub pane can narrow a list without holding a filter window at all.
    var rows = pane.filterRows || []
    var view = Filter.viewOf(pane.shown, index)
    var offset = view - (pane.filterHeld || 0)
    if (view < 0 || offset < 0 || offset >= rows.length) return null
    var row = rows[offset]
    return row.r === index ? row : null
}

// How many rows the standing query has been tested against: the folder once its answer is in, else the held
// window. With no query up there is nothing tested and the held rows are not read, so a window landing
// under no filter re-evaluates nothing here.
function tested(pane) {
    if (pane.filterQuery.length === 0) return pane.total
    if (pane.filterAnswer !== null && pane.filterAnswer.query === pane.filterQuery) return pane.total
    return pane.rows.length
}

// ui/List.qml and ui/GridArea.qml requestIfDrifted under a filter: the drawn rows are matches, so the window
// asked for is the filter's own, in view space, with the listing window's own margin and buffer rules.
function drift(pane, first, last) {
    var answer = pane.filterAnswer
    if (!answer || answer.query !== pane.filterQuery) return null
    var count = answer.list.length
    if (count === 0) return null
    var end = pane.filterHeld + pane.filterRows.length
    var behind = pane.filterHeld > 0 && first - pane.filterHeld < pane.refetchMargin
    var ahead = end < count && end - last < pane.refetchMargin
    if (pane.filterRows.length > 0 && !behind && !ahead) return null
    var ask = { start: Math.max(0, first - pane.buffer), count: pane.windowSize }
    pane.backend.filterWindow(ask.start, ask.count)
    return ask
}

// ui/PaneSwap.qml takeRows: a window landed under a standing query. The same numbering changes nothing;
// another one means the answer names other rows now, so the folder is asked again, once per numbering.
function relisted(pane, listing) {
    if ((pane.filterQuery || "").length === 0 || pane.filterAskedFor === listing) return false
    if (pane.filterAnswer !== null && pane.filterAnswer.listing === listing) return false
    drop(pane)
    return ask(pane)
}
