// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ManualBikeForm } from "./ManualBikeForm";

afterEach(cleanup);

function setup() {
  render(<ManualBikeForm onSubmit={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "+ taille" }));
  fireEvent.click(screen.getByRole("button", { name: "+ taille" }));
  return screen.getAllByRole("tab");
}

describe("ManualBikeForm : onglets de tailles", () => {
  it("roving tabindex et lien tab/panneau", () => {
    const tabs = setup();
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual([
      "-1",
      "-1",
      "0",
    ]);
    const panel = screen.getByRole("tabpanel");
    expect(tabs[2]!.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[2]!.id);
  });

  it("flèches, Début et Fin déplacent focus et sélection", () => {
    const tabs = setup();
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0]!.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(list, { key: "Home" });
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "End" });
    expect(tabs[2]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      tabs[2]!.id,
    );
  });
});
