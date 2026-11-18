import "fake-indexeddb/auto";
import { configure } from "@testing-library/dom";

// Page tests do real computations (positioning pipeline, IndexedDB). Under parallel test load the default 1 s
// async timeout of findBy*/waitFor is too tight and caused rare flakes; 5 s keeps them deterministic.
configure({ asyncUtilTimeout: 5000 });
