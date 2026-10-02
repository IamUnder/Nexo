import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin `globals`, Testing Library no se limpia solo entre tests.
afterEach(cleanup);
