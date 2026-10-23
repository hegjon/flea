.import "../../ui/js/Filter.js" as Filter
.import "../../ui/js/FilterWire.js" as FilterWire
.import "filterfixture.js" as Fixture

// Issue 315: a query over a held window smaller than the folder asks the backend to test the folder's
// names, and its two answers land as the shown model and one view window of rows. The stub pane is
// filter.js's own; its backend records each call in order.

function run(check) {
    // ui/Pane.qml calls ask from onFilterQueryChanged, so a stub types by applying the query and asking.
    function type(p, text) {
        for (var i = 0; i < text.length; i++) {
            Filter.typed(p, text.charAt(i))
            p.refresh()
            FilterWire.ask(p)
            p.refresh()
        }
    }
    // The folder's answer as the backend sends it: runs over listing rows, for the newest gen and the held numbering.
    function land(p, runs) {
        var ok = FilterWire.answered(p, p.filterGen, FilterWire.expand(runs).length, runs, p.backend.heldListing)
        p.refresh()
        return ok
    }
    function rowsFrom(start, count) {
        var out = []
        for (var r = start; r < start + count; r++) out.push({ n: "file-" + r + ".txt", r: r })
        return out
    }
    function last(p) { return p.backend.asked[p.backend.asked.length - 1] }

    // Seven rows held from 400, in a folder of 5,000: the backend is asked, and the held rows answer meanwhile.
    var wide = Fixture.pane("", 400)
    wide.total = 5000
    type(wide, "20")
    check("a query over a window smaller than the folder asks the backend once per keystroke, each with its own gen",
          wide.backend.asked.join(" "), "filter 2:1:0:130 filter 20:2:0:130")
    check("and the numbering asked for is the one held", wide.filterAskedFor, 1)
    check("until the answer lands, the held rows' own matches are shown", wide.shown.join(","), "405,406")
    check("and the strip counts only the rows tested so far", FilterWire.tested(wide), 7)
    check("the answer for the newest gen and the held numbering is taken", land(wide, [[12, 2], [2340, 1]]), true)
    check("and expanded into the shown model, in listing order", wide.shown.join(","), "12,13,2340")
    check("which now counts as the whole folder tested", FilterWire.tested(wide), 5000)
    check("a cursor the folder's answer hides takes the first row shown and the view goes there", wide.cursorIndex + ":" + wide.scrolled, "12:0")
    wide.cursorIndex = 2340
    land(wide, [[12, 2], [2340, 1]])
    check("a cursor the answer keeps stays, and the view follows its view position", wide.cursorIndex + ":" + wide.scrolled, "2340:2")
    check("an answer for a stale gen is dropped", FilterWire.answered(wide, 1, 1, [[7, 1]], 1), false)
    check("as is one for another numbering", FilterWire.answered(wide, 2, 1, [[7, 1]], 2), false)
    check("and neither moved the shown model", wide.shown.join(","), "12,13,2340")

    // One view window of the matched rows, each naming its listing row back.
    var window = [{ n: "file-0012.txt", r: 12 }, { n: "file-0013.txt", r: 13 }, { n: "file-2340.txt", r: 2340 }]
    check("a window for the standing gen lands as the filter's rows", FilterWire.windowed(wide, 0, window, ["Plain text"], 1, wide.filterGen), true)
    check("rowFor answers a matched row the held window does not hold from it", wide.rowFor(2340).n, "file-2340.txt")
    check("and a held row from the held window still", wide.rowFor(405).n, "screenrecording-2026-08-21.mp4")
    check("the window's Kind dictionary is its own", wide.filterKinds.join(","), "Plain text")
    check("a window for a stale gen is dropped", FilterWire.windowed(wide, 0, window, [], 1, 1), false)
    FilterWire.windowed(wide, 1, [{ n: "other", r: 99 }], [], 1, wide.filterGen)
    check("a row that does not name the listing row back is nothing", wide.rowFor(13), null)
    check("as is a view position past the window", wide.rowFor(2340), null)

    // Esc closes the standing query on the backend and drops the answer and its rows.
    Filter.escape(wide); wide.refresh(); FilterWire.ask(wide); wide.refresh()
    check("an empty query closes the standing query", last(wide), "close")
    check("and drops the answer and the rows", (wide.filterAnswer === null) + ":" + wide.filterRows.length + ":" + wide.shown, "true:0:null")

    // A folder the pane holds whole is answered on the keystroke and asks nothing.
    var whole = Fixture.pane()
    type(whole, "scr")
    check("a window that is the whole folder asks the backend nothing", whole.backend.asked.length, 0)
    check("and shows the held rows' own answer", whole.shown.join(","), "0,1,5,6")

    // Drift under the filter: the view-space window on the matches, asked for the way the listing's own is.
    var drifted = Fixture.pane("", 400)
    drifted.total = 5000
    type(drifted, "e")
    check("before the answer lands, a drift check asks nothing", FilterWire.drift(drifted, 0, 34) === null && drifted.backend.asked.length === 1, true)
    land(drifted, [[0, 3000]])
    check("with no filter window held, a drift check asks for one around the view", JSON.stringify(FilterWire.drift(drifted, 0, 34)) + " " + last(drifted), '{"start":0,"count":130} fwindow 0:130')
    FilterWire.windowed(drifted, 0, rowsFrom(0, 130), [], 1, drifted.filterGen)
    check("a view inside the window with margin to spare asks nothing", FilterWire.drift(drifted, 0, 34), null)
    check("a view near the window's end asks ahead of it", last(drifted) === "fwindow 0:130" && FilterWire.drift(drifted, 100, 134) !== null && last(drifted) === "fwindow 50:130", true)
    FilterWire.windowed(drifted, 500, rowsFrom(500, 130), [], 1, drifted.filterGen)
    check("and a view near its start asks behind it", FilterWire.drift(drifted, 510, 544) !== null && last(drifted) === "fwindow 460:130", true)

    // A listing still out asks nothing; the rows landing under another numbering ask once.
    var out = Fixture.pane("", 400)
    out.total = 5000
    out.listInFlight = true
    type(out, "s")
    check("a query typed while a listing is out asks nothing yet", out.backend.asked.length, 0)
    out.listInFlight = false
    check("the rows landing ask the folder", FilterWire.relisted(out, 1) && last(out) === "filter s:1:0:130", true)
    check("a window of the same numbering changes nothing", FilterWire.relisted(out, 1), false)
    land(out, [[1, 1]])
    out.backend.heldListing = 2
    check("another numbering drops the answer and asks again", FilterWire.relisted(out, 2) && out.filterAnswer === null && last(out).indexOf("filter s:2:") === 0, true)
    check("and a pane with no query standing is left alone", FilterWire.relisted(Fixture.pane(), 3), false)

    // The selection: what the held rows hide goes on the keystroke, what they cannot test waits for the folder.
    var marked = Fixture.pane("", 400)
    marked.total = 5000
    marked.selection.toggle(1000)
    marked.selection.toggle(403)
    type(marked, "scr")
    check("a selected held row the query hides leaves the selection, a selected row outside the window stays", Fixture.picks(marked), "1000")
    land(marked, [[0, 1], [5, 2]])
    check("and goes when the folder's answer hides it", Fixture.picks(marked), "")

    check("expand turns runs back into the rows they stand for", FilterWire.expand([[0, 3], [5, 1]]).join(","), "0,1,2,5")
    var rows = Fixture.listing()
    check("standing answers the held rows' own subsequence with no answer in", FilterWire.standing(null, rows, 0, "scr").join(","), "0,1,5,6")
    check("the folder's answer while it is for the standing query", FilterWire.standing({ query: "scr", list: [9] }, rows, 0, "scr").join(","), "9")
    check("and the held rows' own again once the query moved on", FilterWire.standing({ query: "sc", list: [9] }, rows, 0, "scr").join(","), "0,1,5,6")
}
