# NavMe-Gcu

Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, and
set `NEXT_PUBLIC_MATTERPORT_SDK_KEY` to your Matterport SDK key. Allow your
local domain in the key settings. Run `npm run dev`, then open
`http://localhost:443/`. The port matches the Matterport SDK application's
allowed local domain. Add `?survey=1` to the URL to open the label editor.

## Building labels

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
