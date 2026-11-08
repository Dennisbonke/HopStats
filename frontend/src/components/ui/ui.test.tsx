import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Button, Card, FormField, StatusBadge } from "./index";

afterEach(cleanup);

test("Button defaults to a safe type and supports variants and native behavior", async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  const onSubmit = vi.fn();
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Button onClick={onClick} className="extra-class" aria-pressed="false">
        Save changes
      </Button>
      <Button type="submit" variant="secondary">
        Submit changes
      </Button>
      <Button type="reset" variant="secondary">
        Reset changes
      </Button>
      <Button variant="danger">Delete</Button>
      <Button variant="ghost" disabled>
        Unavailable
      </Button>
    </form>,
  );

  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save).toHaveAttribute("type", "button");
  expect(save).toHaveAttribute("aria-pressed", "false");
  expect(save).toHaveClass("ui-button", "ui-button--primary", "extra-class");
  expect(
    screen.getByRole("button", { name: "Submit changes" }),
  ).toHaveAttribute("type", "submit");
  expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
    "ui-button--danger",
  );
  const unavailable = screen.getByRole("button", { name: "Unavailable" });
  expect(unavailable).toBeDisabled();
  expect(unavailable).toHaveClass("ui-button--ghost");

  await user.click(save);
  expect(onClick).toHaveBeenCalledOnce();
  save.focus();
  expect(screen.getByRole("button", { name: "Save changes" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onClick).toHaveBeenCalledTimes(2);
  await user.keyboard(" ");
  expect(onClick).toHaveBeenCalledTimes(3);
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Submit changes" }));
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Reset changes" })).toHaveAttribute(
    "type",
    "reset",
  );
});

test("Card defaults to a neutral div and supports semantic elements and variants", () => {
  render(
    <>
      <Card className="local-layout">Standard content</Card>
      <Card as="article" variant="muted" aria-label="Muted card">
        Muted content
      </Card>
      <Card as="section" variant="raised">
        Raised content
      </Card>
    </>,
  );

  const standard = screen.getByText("Standard content");
  expect(standard.tagName).toBe("DIV");
  expect(standard).toHaveClass("ui-card", "ui-card--standard", "local-layout");
  expect(screen.getByLabelText("Muted card")).toHaveClass("ui-card--muted");
  expect(screen.getByText("Raised content").tagName).toBe("SECTION");
  expect(screen.getByText("Raised content")).toHaveClass("ui-card--raised");
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

test("FormField associates labels, help and errors with native controls", () => {
  render(
    <>
      <FormField
        id="beer-count"
        label="Beer count"
        hint="Enter a whole number."
        error="Must be greater than zero."
      >
        <input type="number" aria-describedby="existing-description" />
      </FormField>
      <span id="existing-description">Count of beers.</span>
      <FormField id="beer-style" label="Beer style" disabled>
        <select defaultValue="ipa">
          <option value="ipa">IPA</option>
        </select>
      </FormField>
    </>,
  );

  const count = screen.getByRole("spinbutton", { name: "Beer count" });
  expect(count).toHaveAttribute("id", "beer-count");
  expect(count).toHaveAttribute(
    "aria-describedby",
    "existing-description beer-count-hint beer-count-error",
  );
  expect(count).toHaveAttribute("aria-invalid", "true");
  expect(count).toHaveClass("ui-form-field__control");
  expect(screen.getByText("Enter a whole number.")).toHaveAttribute(
    "id",
    "beer-count-hint",
  );
  expect(screen.getByText("Must be greater than zero.")).toHaveAttribute(
    "id",
    "beer-count-error",
  );

  const style = screen.getByRole("combobox", { name: "Beer style" });
  expect(style).toBeDisabled();
});

test("StatusBadge presents readable text with semantic visual variants", () => {
  const { container } = render(
    <>
      <StatusBadge variant="success">Completed</StatusBadge>
      <StatusBadge variant="warning">Needs review</StatusBadge>
      <StatusBadge variant="error">Failed</StatusBadge>
      <StatusBadge variant="info">Processing</StatusBadge>
      <StatusBadge>Unknown</StatusBadge>
    </>,
  );

  expect(screen.getByText("Completed")).toHaveClass("ui-status-badge--success");
  expect(screen.getByText("Needs review")).toHaveClass(
    "ui-status-badge--warning",
  );
  expect(screen.getByText("Failed")).toHaveClass("ui-status-badge--error");
  expect(screen.getByText("Processing")).toHaveClass("ui-status-badge--info");
  expect(screen.getByText("Unknown")).toHaveClass("ui-status-badge--neutral");
  expect(
    container.querySelectorAll('[role="status"], [role="alert"]'),
  ).toHaveLength(0);
});
