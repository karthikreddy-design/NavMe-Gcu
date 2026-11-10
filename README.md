# NavMe-Gcu

## Building labels

The normal viewer at `/` displays saved building labels. Open `/?survey=1` to
add, edit, or delete them. To add a label, enter a unique building ID and
confirmed name, choose **Select anchor in scan**, aim at a point on the intended
building, then choose **Add Building**. The editor records Matterport's model
intersection point; it does not infer a building center from scan viewpoints.
The cyan pin tip marks the saved 3D anchor; its name badge is offset above the
point for readability. Projection uses the Matterport iframe's measured size
and offset so the pin aligns with the viewer.

Labels are saved in this browser's `localStorage` and remain after refreshes.
This is suitable for local surveying and visitors using the same browser
storage, but it does not synchronize changes to other devices or users. Shared
publishing requires a backend. Do not treat the survey URL as access control;
it is a UI mode, not authentication.

## Building selection and floors

Selecting a saved label asks the Showcase SDK to reframe its camera on that
building's verified 3D anchor. This is a camera focus, not building isolation:
the campus model is a shared scan, and the SDK floor selector applies to the
whole model. Per-building floor assignments are configured in the survey
editor from floors reported by Matterport. The visitor's floor buttons call the
SDK floor navigation and clearly indicate the active selection; other
structures on the same floor can remain visible.