// Historical reference only — kept so GoogleSheetSettings.jsx can still show
// which Sheet this app is backed by. All actual reads/writes now go through
// the authenticated backend in src/services/api.js (see gas/Code.gs).
//
// This file used to fetch the Sheet directly as a public CSV
// (gviz/tq?tqx=out:csv) from the browser with no authentication — that was
// the root cause of the PIN/data-exposure issue fixed by moving to a backend.

export const SHEET_ID = '1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk';
