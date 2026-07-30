import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GameHUD } from "../src/game/ui/GameHUD";
import { DEFAULT_HUD } from "../src/game/types";

const defeatedState = {
  ...DEFAULT_HUD,
  loading: false,
  ready: true,
  locked: false,
  gameOver: true,
  health: 0,
  score: 1340,
  kills: 7,
  level: 3,
};

describe("shared game-over HUD", () => {
  test("highlights the final score and offers all recovery paths", () => {
    const html = renderToStaticMarkup(
      <GameHUD
        state={defeatedState}
        mode="alley"
        onEngage={() => {}}
        onExit={() => {}}
        onRetry={() => {}}
        onSwitchMode={() => {}}
      />,
    );

    expect(html).toContain("Mission failed");
    expect(html).toContain("Final score");
    expect(html).toContain("01340");
    expect(html).toContain("Redeploy same map");
    expect(html).toContain("Try Legacy Training Range");
    expect(html).toContain("Return to command");
  });

  test("offers the alley when the player loses in the range", () => {
    const html = renderToStaticMarkup(
      <GameHUD
        state={defeatedState}
        mode="range"
        onEngage={() => {}}
        onExit={() => {}}
        onRetry={() => {}}
        onSwitchMode={() => {}}
      />,
    );

    expect(html).toContain("Try Alley Operations");
  });
});

describe("contextual interaction HUD", () => {
  test("shows the correct door instruction only while a door is targeted", () => {
    const state = {
      ...DEFAULT_HUD,
      loading: false,
      ready: true,
      locked: true,
      interactionPrompt: "Open door",
    };
    const desktop = renderToStaticMarkup(
      <GameHUD
        state={state}
        mode="alley"
        onEngage={() => {}}
        onExit={() => {}}
        onRetry={() => {}}
        onSwitchMode={() => {}}
      />,
    );
    const touch = renderToStaticMarkup(
      <GameHUD
        state={state}
        mode="alley"
        touch
        onEngage={() => {}}
        onExit={() => {}}
        onRetry={() => {}}
        onSwitchMode={() => {}}
      />,
    );

    expect(desktop).toContain(">E</kbd>");
    expect(desktop).toContain("Open door");
    expect(touch).toContain(">USE</kbd>");
  });
});
