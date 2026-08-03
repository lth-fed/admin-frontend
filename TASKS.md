- the get groups im member of is removed, since we get that on the user object
- hide edit button for groups i can't edit! (i am direct admin of it or admin of parent, figure this
  out on the frontend), also highlight groups I am admin over
- can you investigate if the auth persists between days of not opening the website?
- languages wrong way around in groups (could be frontend or seeding issue)
- approve button for indivitual requests to join memberships, instead of an input to enter people to
  allow
- rename "Groups with activity access" to "Groups whose admins (and subgroups' admins) can see our
  activities" (change the swedish i18n too).
- english override isn't working, it stops after first; make all overrides toggle switches
- make full page error when we don't have any adminships
- toast on auth errors (error_message in query as per oidc specs, see if this is a functionality in
  the oidc library)
- only allow editing admins for my subgroups (fetch fails because we don't have authorization, so
  don't do it)
- contact validate phone number & clear on type change
- toast with error on invalid input in form (with which field is invalid)
- also show which field is invalid
- organizer dropdown should only contain the groups i am admin of
- are dropdowns svar dropdowns?
- rename "Hide from other administrators" to "Make this activity extra hidden (hides it from the
  administrators from other groups configured in the group settings)", including swedish translation
- max tickets default to unset (= i32::MAX) (make the i32::max for max_tickets on activity &
  ticket_kind not shown in frontend, just have a toggle for setting a max, if it's off, use the
  i32::MAX)
- when trying to edit tickets: Uncaught Error: Missing parameter 'id' in route /activities/[id]
  (maybe update api schema (i've restarted backend))
- the request to upload images responds with
  `<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Each form field that you specify in a form must appear in the list of policy conditions. &quot;content-length-range&quot; not specified in the policy.</Message></ Error>`
  even though content-length-range is part of the polcy BASE64 encoded string in the request.
- make days clickable in the calendar, but add a back button or a dropdown to select month / day, so
  the admin can go back
