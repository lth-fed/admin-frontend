- [x] make the next / previous buttons arrows next to the month/week/date (use svar pager)
  - Question: SVAR Pager is page-number based and includes “rows per page”; should the calendar use
    its arrow styling only, or expose a synthetic page number? Implementing arrow-style period
    navigation because a synthetic page number has no calendar meaning.
  - Answer: just the arrows:)
- [x] use svar Combo for user inputs (display ID & name using template)
- [x] make allowed group IDs in ticket kind editor use the tree view (make all multiple-group
      pickers that instead of input & list)
- [x] rename arrangör -> skapare
- [x] remame värd -> arrangör
- [x] preview images in all places they are uploaded
- [x] heading for edit contexts should be sticky on the screen; we want to see which group /
      activity we're editing even as we're scrolling down
- [x] in the activity creation page, make a multi-step flow (with indicator at top of page) (make no
      changes to the API)
  - activity details (name, image, time, creator, etc)
  - logistics (hosts, location, etc)
  - tickets (should there be any?) (explain access (see swedish translation of
    `activities_details`))
    - no tickets: access (multi-group picker for a "empty" ticket kind) (write )
    - tickets: simple to view list of ticket kinds, make ticket options collapsable, also include
      separate access view as above, say it's people who can see the event but not buy tickets (for
      free, simple & invited/allocated: show toggle for matpref, otherwise hide options)
    - include activity max tickets & extra hidden options here
  - notifications (collected view for all ticket kinds)
    - list of scheduled notifications
    - info about pre-release & release
    - button to add new notification (specific ticket kind or all)
    - specify it only sends to those who can buy the ticket
- [x] hide add subgroup popup after creating new group
- [x] Om bilden är under 1mb, re encoda inte den
- [x] activity view: svar datagrid for addons (1 top level row for i.e. Dryckespaket, 2 second level
      rows for Alkoholpaket & Alkoholfritt, third level is people who bought them), be able to
      expand to see individual buyers. Do the same breakdown for ticket kind base purchases. Group
      addons from different ticket kinds are summed up, cumulated by name.
- [x] remove the charting code we currently have
- [x] activities & ticket kind views: list of buyers in svar datagrid, can expand to see what
      options & base ticket kind they chose. Total sum is viewed per user.
- [x] use svar editor components & validation for forms
  - Question: SVAR Editor is a record editor driven by a flat field schema and cannot represent the
    nested localized, add-on, tree, upload, and report forms without losing their current UX. Should
    it replace only compatible scalar sections, or should all forms be flattened to fit it? Keeping
    the purpose-built form components and using SVAR inputs/validation where compatible pending your
    decision.
  - Answer: nevermind then, continue using our custom implementation!
- [x] do a pass to check for components / places with similar behaviour and ask me if they should be
      merged / if one should be picked over the other, like how we did with the multi-group select
      being a tree vs select+list.
  - Question: The activity editor's organizer tree includes invite/pending/remove actions, while
    `GroupTreePicker` is selection-only. Should the shared tree component gain pluggable row actions
    so these two tree renderers can be merged?
  - Answer: it it's not very complex (i.e. just a snippet or similar), then yes.
  - Implemented: all group trees now use a shared path explorer with a row snippet.
  - Question: Ticket fields and notification fields now occur in both the creation wizard and their
    full editors. Should they be extracted into shared form sections, accepting that the wizard's
    deliberately reduced options would add configuration to those components?
  - Answer: yes
  - Implemented: ticket basics and notification fields are shared between creation and editing.
  - Question: The group administration page displays the whole path tree with icons but does not
    collapse branches, while selection trees collapse them. Should the administration tree also use
    collapsible branch exploration?
  - Answer: Yes please. Maybe even reusing same component. Though they need to be more spacy than
    the in-line picker. adding a div with e.g. class="h-3" as the row component could be a possible
    solution
  - Implemented: the administration tree uses the shared explorer's spacious row mode and expands
    paths containing directly administered groups on load.
- [x] for group tree, show icons for groups
- [x] I dag -> Tillbaka till idag. Also move the day/week/month picker to next to the aforementioned
      button, right now it's under.
- [x] Show full add-on settings for advanced tickets in the activity wizard, and make add-ons and
      alternatives collapsible in both ticket editors.
- [x] Make activity editing use the same four-tab structure as activity creation, including
      visibility access management and activity-level purchased-ticket views.
- [x] Keep Save and Publish/Unpublish in a sticky bottom-right action dock and clearly mark hidden
      activities as not published in the heading.
- [x] Filter group administrator user pickers to `email:` identities.
- [x] Remove impossible non-admin and parent-admin modes from group editing.
