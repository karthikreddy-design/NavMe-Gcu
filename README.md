# NavMe-Gcu

Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, and
set `NEXT_PUBLIC_MATTERPORT_SDK_KEY` to your Matterport SDK key. Allow your
local domain in the key settings. Run `npm run dev`, then open
`http://localhost:443/`. The port matches the Matterport SDK application's
allowed local domain. Add `?survey=1` to the URL to open the label editor.

## Building labels

Survey editing now requires an admin session. Open `/?survey=1` on localhost
and create an admin password (at least 12 characters) on the first visit.
Use that password to sign in on subsequent visits. The **Building labels**
tab contains the existing label editor; existing campus data is retained.

The normal viewer at `/` displays saved building labels. Open `/?survey=1` to
add, edit, or delete them. To add a label, enter a unique building ID and
confirmed name, choose **Select anchor in scan**, aim at a point on the intended
building, then choose **Add Building**. The editor records Matterport's model
intersection point; it does not infer a building center from scan viewpoints.
The cyan pin tip marks the saved 3D anchor; its name badge is offset above the
point for readability. Projection uses the Matterport iframe's measured size
and offset so the pin aligns with the viewer.

The eight saved campus labels ship in `src/data/defaultBuildings.json` so a
fresh clone displays them. Edits are saved to `.data/buildings.json` by the
local Next.js server, shared by Chrome and the VS Code preview. Browser
localStorage is retained as a backup. Refresh other browsers after editing.
The `.data` directory is ignored by Git; back it up before moving the project
or update the default JSON with your latest labels before publishing.
The server needs writable, persistent storage for edits to survive restarts.

## Building selection and floors

Selecting a saved label keeps the assigned floor selected (or switches to its
only assigned floor), then opens a zoomed floor-plan view centered on the building's verified
3D anchor. Buildings with multiple assigned floors retain the current floor,
which visitors can change using Matterport's floor selector. This is a camera focus, not
building isolation: the campus model is a shared scan, and the SDK floor
selector applies to the whole model. Other structures on the same floor can
remain visible.

## Walkthrough navigation

The selected-space panel's **View space** button opens the configured
Matterport walkthrough point for IIPC, Front Office, Library, Indoor
Auditorium, Cafeteria, Cafeteria 2, Mac Lab, or Indoor Sports. Only the selected label is shown
in walkthrough mode when its anchor is on screen. **Return to full campus** restores the
Dollhouse overview and campus labels. These destinations are maintained in
`src/data/walkthroughDestinations.ts`.

## Billboards

Open `http://localhost:443/?survey=1`, sign in, and select **Billboards**.
Add a title and description, capture a surface position in the model (or
select a saved building anchor), and upload photos or videos. Capture uses
the most recent model point you aimed at; choose **Use this position** to
confirm it. Existing anchors are retained when editing unless replaced.
Use **Preview content card** before saving. Saved draft billboards can also
be clicked in the model to preview them. Select **Published** and leave
**Enabled** checked, then save, to make the billboard visible to visitors.
To hide a billboard, save it as a draft or disable it. Delete removes the
billboard record; media files are retained to avoid deleting shared assets.

Visitor mode at `/` never mounts the editor. It fetches only published,
enabled records and displays read-only content cards with photo galleries
and playable videos. Visitors can close a card with its close button,
the Escape key, or by clicking outside it. Returning to a browser tab
refreshes its billboards; reload also fetches the latest saved content.

Photos: JPEG, PNG, WebP and GIF. Videos: MP4 and WebM. Each billboard supports
up to 20 files, 50 MB per file. Media is streamed with byte-range support.
Browser codec support still applies; MP4/H.264 and WebM are suitable choices.

Billboards persist in `.data/billboards.json`; uploads are in `.data/media/`.
The currently published billboards ship in `src/data/defaultBillboards.json`
with their media in `assets/billboard-media/`, so fresh clones include them.
Runtime edits take precedence over this snapshot. Drafts, disabled billboards,
unused uploads, and admin credentials are excluded from the published snapshot.
Admin password hashes and the session signing secret are stored server-side
in `.data/admin-auth.json`. Back up the entire `.data` directory securely;
it is excluded from Git. Set `NAVME_DATA_DIR` to an absolute persistent
directory for a hosted Node server or an isolated test installation.
Ephemeral/serverless disk is not a durable deployment target for this store.

`?survey=1` only selects an interface and **is not authorization**. Editing
APIs also require an eight-hour HttpOnly admin session, same-origin requests,
and explicit survey request context. These checks cover building edits and
media uploads as well. First-time password setup is limited to localhost;
complete setup before exposing the server to other users. HTTPS should be
used for a hosted deployment. Never publish `.env.local` or `.data`.

Run `npm run test:billboards` to build and test authentication, visitor write
denial, draft/published filtering, media access, publishing, deletion and
data preservation. Tests start a separate server and use temporary storage.
