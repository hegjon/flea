.pragma library
.import "Filter.js" as Filter

// The filter's backend half (issue 315). ui/js/Filter.js narrows the rows the pane holds on the keystroke
// itself and never reaches ui/Backend.qml; this asks the backend to test the whole folder's names, which
// it already holds, and takes the two answers back: the matches as runs, and one view window of their
// rows, stat'd for the screen and nothing else (rule 1). The held window stays what it was, so a folder
// the pane holds whole is answered on the keystroke and asks nothing. docs/protocol.md "filter".

// ui/Pane.qml onFilterQueryChanged. Each keystroke takes a new gen, so a late answer names the keystroke
// it is for, and the query asked is kept beside the gen; an empty query closes the standing one. Over a
// listing still out, relisted below asks. The first window is placed around the cursor's listing row,
// since only the backend knows where that row stands among the folder's matches.
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
    pane.filterAsked = pane.filterQuery
    pane.backend.filter(pane.filterQuery, pane.filterGen, pane.cursorIndex, pane.buffer, pane.windowSize)
    return true
}

function drop(pane) {
    pane.filterAskedFor = -1
    pane.filterAsked = ""
    if (pane.filterAnswer !== null) pane.filterAnswer = null
    if (pane.filterRows.length > 0) {
        pane.filterHeld = 0
        pane.filterRows = []
        pane.filterKinds = []
    }
}

// A reply is for the standing query only while its gen is the newest, its numbering the one held and
// the query asked with that gen the one standing: the query moves on with no ask while a listing is out.
function current(pane, gen, listing) {
    return pane.filterQuery.length > 0 && gen === pane.filterGen && listing === pane.backend.heldListing
        && pane.filterAsked === pane.filterQuery
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

// ui/List.qml, ui/GridArea.qml and ui/ColumnPane.qml requestIfDrifted under a filter: the drawn rows are
// matches, so the window asked for is the filter's own, in view space, with the listing window's own
// margin and buffer rules.
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

// ui/PaneSwap.qml takeRows, before a row of another numbering is read: the standing answer and its window
// name the numbering that went, so both go at once, and relisted below asks again once the rows are in.
function renumbered(pane, listing) {
    if (pane.filterAnswer && pane.filterAnswer.listing !== listing) drop(pane)
}

// ui/PaneSwap.qml rowsLanded, once no listing is out: rows landed under a standing query, by a swap or
// alone. The same numbering changes nothing; another one means the answer names other rows now, so the
// folder is asked again, once per numbering. The swap's own path lands through land, never the plain
// window's, so this sits where both end.
function relisted(pane, listing) {
    if ((pane.filterQuery || "").length === 0 || pane.filterAskedFor === listing) return false
    if (pane.filterAnswer !== null && pane.filterAnswer.listing === listing) return false
    drop(pane)
    return ask(pane)
}
