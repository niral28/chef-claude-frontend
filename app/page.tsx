"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  DisconnectButton,
  VideoTrack,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { RoomEvent, Track, facingModeFromLocalTrack, type LocalVideoTrack } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";

interface Timer {
  id: number;
  label: string;
  endsAt: number;
  duration: number;
}

interface Recipe {
  title: string;
  servings: number;
  prepTimeMinutes: number;
  ingredients: string[];
  steps: string[];
  currentStep?: number; // 1-based
  tutorialUrl?: string;
  tutorialTitle?: string;
  tutorialSource?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
}

interface DishOption {
  title: string;
  description: string;
}

interface GroceryItem {
  recipe: string;
  ingredients: string[];
  checked: string[];
}

function useTimers() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [, setTick] = useState(0);
  const nextId = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  // Tick every second to update countdown displays
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Check for expired timers
  useEffect(() => {
    const now = Date.now();
    const expired = timers.filter((t) => t.endsAt <= now);
    if (expired.length > 0) {
      expired.forEach((t) => playAlarm(t.label));
      setTimers((prev) => prev.filter((t) => t.endsAt > now));
    }
  }, [timers, /* ticked by setTick */]);

  const playAlarm = useCallback((label: string) => {
    if (!audioRef.current) {
      audioRef.current = new AudioContext();
    }
    const ctx = audioRef.current;
    // Play a pleasant chime pattern
    [0, 0.2, 0.4].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.3);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });

    // Also try a notification if permitted
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`Timer done: ${label}`);
    }
  }, []);

  const addTimer = useCallback((label: string, durationSeconds: number) => {
    // Request notification permission on first timer
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setTimers((prev) => [
      ...prev,
      {
        id: nextId.current++,
        label,
        endsAt: Date.now() + durationSeconds * 1000,
        duration: durationSeconds,
      },
    ]);
  }, []);

  const dismissTimer = useCallback((id: number) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { timers, addTimer, dismissTimer };
}

function formatTimeLeft(endsAt: number): string {
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TimerDisplay({ timers, onDismiss }: { timers: Timer[]; onDismiss: (id: number) => void }) {
  if (timers.length === 0) return null;

  return (
    <div className="w-full max-w-md flex flex-col gap-2">
      {timers.map((timer) => (
        <div
          key={timer.id}
          className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3 border border-zinc-700"
        >
          <div className="flex items-center gap-3">
            <span className="text-orange-400 text-xl">⏱</span>
            <span className="text-zinc-200">{timer.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono text-white tabular-nums">
              {formatTimeLeft(timer.endsAt)}
            </span>
            <button
              onClick={() => onDismiss(timer.id)}
              className="text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecipeCard({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"ingredients" | "steps">("steps");
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Auto-scroll to the current step and switch to steps tab
  useEffect(() => {
    if (recipe.currentStep && recipe.currentStep >= 1) {
      setActiveTab("steps");
      if (!expanded) setExpanded(true);
      const el = stepRefs.current[recipe.currentStep - 1];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [recipe.currentStep]);

  // Collapsed preview card
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full max-w-md bg-gradient-to-r from-zinc-800 to-zinc-850 rounded-2xl border border-zinc-700 px-5 py-4 text-left hover:border-orange-600/50 hover:shadow-lg hover:shadow-orange-600/5 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate group-hover:text-orange-50 transition-colors">
              {recipe.title}
            </h2>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {recipe.prepTimeMinutes} min
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-xs text-zinc-400">{recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}</span>
              <span className="text-zinc-600">|</span>
              <span className="text-xs text-zinc-400">{recipe.ingredients.length} ingredients</span>
              {recipe.tutorialUrl && (
                <>
                  <span className="text-zinc-600">|</span>
                  <span className="text-xs text-orange-400">Tutorial</span>
                </>
              )}
            </div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 group-hover:text-orange-400 transition-colors shrink-0 ml-3">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
    );
  }

  // Expanded detail view
  return (
    <div className="w-full max-w-md bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-2xl border border-zinc-700 shadow-xl">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-zinc-700/50">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">{recipe.title}</h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {recipe.prepTimeMinutes} min
              </span>
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                {recipe.ingredients.length} ingredients
              </span>
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                {recipe.steps.length} steps
              </span>
            </div>
            {recipe.tutorialUrl && (
              <a
                href={recipe.tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-3 rounded-lg border border-zinc-600 hover:border-orange-600/50 overflow-hidden transition-all group/link"
                onClick={(e) => e.stopPropagation()}
              >
                {recipe.ogImage && (
                  <div className="w-full h-32 overflow-hidden bg-zinc-700">
                    <img
                      src={recipe.ogImage}
                      alt=""
                      className="w-full h-full object-cover group-hover/link:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium text-zinc-100 line-clamp-1 group-hover/link:text-orange-200 transition-colors">
                    {recipe.ogTitle || recipe.tutorialTitle || "View tutorial"}
                  </p>
                  {recipe.ogDescription && (
                    <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{recipe.ogDescription}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" x2="21" y1="14" y2="3" />
                    </svg>
                    <span className="text-xs text-zinc-500">{recipe.tutorialSource}</span>
                  </div>
                </div>
              </a>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setExpanded(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title="Collapse"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title="Close recipe"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 7 10 10" />
                <path d="M7 17 17 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex border-b border-zinc-700/50">
        <button
          onClick={() => setActiveTab("ingredients")}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "ingredients"
              ? "text-orange-400 border-b-2 border-orange-400"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Ingredients
        </button>
        <button
          onClick={() => setActiveTab("steps")}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "steps"
              ? "text-orange-400 border-b-2 border-orange-400"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Steps
        </button>
      </div>

      {/* Ingredients Section */}
      {activeTab === "ingredients" && (
        <div className="px-5 py-4">
          <ul className="space-y-2">
            {recipe.ingredients.map((ingredient, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                <span className="text-zinc-200">{ingredient}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Steps Section */}
      {activeTab === "steps" && (
        <div className="px-5 py-4">
          <ol className="space-y-3">
            {recipe.steps.map((step, i) => {
              const stepNum = i + 1;
              const isCurrent = recipe.currentStep === stepNum;
              const isPast = recipe.currentStep ? stepNum < recipe.currentStep : false;
              return (
                <li
                  key={i}
                  ref={(el) => { stepRefs.current[i] = el; }}
                  className={`flex gap-3 text-sm rounded-lg px-3 py-2.5 transition-all duration-300 ${
                    isCurrent
                      ? "bg-orange-600/15 border border-orange-600/30"
                      : isPast
                        ? "opacity-50"
                        : ""
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5 transition-colors ${
                      isCurrent
                        ? "bg-orange-500 text-white"
                        : isPast
                          ? "bg-zinc-700 text-zinc-400"
                          : "bg-orange-600/20 text-orange-400"
                    }`}
                  >
                    {isPast ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </span>
                  <span className={`leading-relaxed ${isCurrent ? "text-white font-medium" : "text-zinc-200"}`}>
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function DishSuggestions({
  options,
  onSelect,
}: {
  options: DishOption[];
  onSelect: (title: string) => void;
}) {
  return (
    <div className="w-full max-w-md flex flex-col gap-2">
      <p className="text-sm text-zinc-400 font-medium px-1">Pick a dish or say your choice:</p>
      {options.map((option, i) => (
        <button
          key={i}
          onClick={() => onSelect(option.title)}
          className="w-full text-left bg-zinc-800 hover:bg-zinc-750 rounded-xl px-4 py-3.5 border border-zinc-700 hover:border-orange-600/50 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-white group-hover:text-orange-50 transition-colors">
                {option.title}
              </h3>
              <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">{option.description}</p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-600 group-hover:text-orange-400 transition-colors shrink-0 ml-3"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

function GroceryList({
  items,
  onToggle,
  forceExpanded,
  onClose,
}: {
  items: GroceryItem[];
  onToggle: (recipeIdx: number, ingredient: string) => void;
  forceExpanded?: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = forceExpanded || expanded;
  const totalIngredients = items.reduce((sum, g) => sum + g.ingredients.length, 0);
  const totalChecked = items.reduce((sum, g) => sum + g.checked.length, 0);

  // Sync forceExpanded into local state
  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  if (items.length === 0) return null;

  if (!isExpanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full max-w-md bg-gradient-to-r from-emerald-900/40 to-zinc-800 rounded-2xl border border-emerald-700/50 px-5 py-4 text-left hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-600/5 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 text-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-white group-hover:text-emerald-50 transition-colors">
                Grocery List
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {totalChecked}/{totalIngredients} items
              </p>
            </div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 group-hover:text-emerald-400 transition-colors shrink-0">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
    );
  }

  return (
    <div className="w-full max-w-md bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-2xl border border-emerald-700/40 shadow-xl">
      <div className="px-5 pt-4 pb-3 border-b border-zinc-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </span>
          <h3 className="text-lg font-bold text-white">Grocery List</h3>
          <span className="text-xs text-zinc-400">{totalChecked}/{totalIngredients}</span>
        </div>
        <button
          onClick={() => { setExpanded(false); onClose(); }}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
      <div className="px-5 py-4 space-y-4">
        {items.map((group, gIdx) => (
          <div key={gIdx}>
            <h4 className="text-sm font-medium text-emerald-400 mb-2">{group.recipe}</h4>
            <ul className="space-y-1.5">
              {group.ingredients.map((ingredient, iIdx) => {
                const isChecked = group.checked.includes(ingredient);
                return (
                  <li key={iIdx}>
                    <button
                      onClick={() => onToggle(gIdx, ingredient)}
                      className="flex items-center gap-3 w-full text-left py-1 group/item"
                    >
                      <span
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? "bg-emerald-600 border-emerald-600"
                            : "border-zinc-600 group-hover/item:border-emerald-500"
                        }`}
                      >
                        {isChecked && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <span
                        className={`text-sm transition-colors ${
                          isChecked
                            ? "text-zinc-500 line-through"
                            : "text-zinc-200 group-hover/item:text-white"
                        }`}
                      >
                        {ingredient}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceAssistantUI() {
  const { state, audioTrack } = useVoiceAssistant();
  const localParticipant = useLocalParticipant();
  const room = useRoomContext();
  const { timers, addTimer, dismissTimer } = useTimers();
  const [cameraRequest, setCameraRequest] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [dishSuggestions, setDishSuggestions] = useState<DishOption[]>([]);
  const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
  const [groceryListOpen, setGroceryListOpen] = useState(false);

  const toggleGroceryItem = useCallback((recipeIdx: number, ingredient: string) => {
    setGroceryList((prev) => {
      const updated = [...prev];
      const group = { ...updated[recipeIdx] };
      if (group.checked.includes(ingredient)) {
        group.checked = group.checked.filter((c) => c !== ingredient);
      } else {
        group.checked = [...group.checked, ingredient];
      }
      updated[recipeIdx] = group;
      return updated;
    });
  }, []);

  const selectDish = useCallback(async (title: string) => {
    setDishSuggestions([]);
    const msg = JSON.stringify({ type: "select_dish", title });
    await room.localParticipant.publishData(new TextEncoder().encode(msg), {
      topic: "dish_selection",
      reliable: true,
    });
  }, [room]);

  // Listen for data messages from the agent
  useEffect(() => {
    const handleData = (
      payload: Uint8Array,
      _participant: any,
      _kind: any,
      topic: string | undefined,
    ) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (topic === "timer" && msg.type === "set_timer") {
          addTimer(msg.label, msg.duration_seconds);
        } else if (topic === "camera_request" && msg.type === "request_camera") {
          setCameraRequest(true);
        } else if (topic === "recipe") {
          if (msg.type === "recipe_start") {
            setRecipe({
              title: msg.title,
              servings: msg.servings || 1,
              prepTimeMinutes: msg.prep_time_minutes || 0,
              ingredients: msg.ingredients || [],
              steps: msg.steps || [],
            });
            setDishSuggestions([]); // clear suggestions when recipe starts
          } else if (msg.type === "recipe_refresh") {
            setRecipe((prev) =>
              prev
                ? {
                    ...prev,
                    title: msg.title || prev.title,
                    ingredients: msg.ingredients || prev.ingredients,
                    steps: msg.steps || prev.steps,
                  }
                : prev
            );
          } else if (msg.type === "step_update") {
            setRecipe((prev) =>
              prev ? { ...prev, currentStep: msg.step_number } : prev
            );
          } else if (msg.type === "recipe_update") {
            setRecipe((prev) =>
              prev
                ? {
                    ...prev,
                    tutorialUrl: msg.tutorial_url,
                    tutorialTitle: msg.tutorial_title,
                    tutorialSource: msg.tutorial_source,
                    ogImage: msg.og_image,
                    ogTitle: msg.og_title,
                    ogDescription: msg.og_description,
                  }
                : prev
            );
          } else if (msg.type === "recipe_end") {
            setRecipe(null);
          }
        } else if (topic === "suggestions" && msg.type === "dish_suggestions") {
          setDishSuggestions(msg.options || []);
        } else if (topic === "grocery_list") {
          if (msg.type === "grocery_list_update" || msg.type === "grocery_list_show") {
            setGroceryList((msg.items || []).map((item: any) => ({
              recipe: item.recipe || "",
              ingredients: item.ingredients || [],
              checked: item.checked || [],
            })));
          }
          if (msg.type === "grocery_list_show") {
            setGroceryListOpen(true);
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, addTimer]);

  const enableCameraFromRequest = useCallback(async () => {
    setCameraRequest(false);
    await room.localParticipant.setCameraEnabled(true, {
      facingMode: "environment",
    });
  }, [room]);

  const cameraPublication = localParticipant.localParticipant.getTrackPublication(Track.Source.Camera);
  const isCameraEnabled = localParticipant.isCameraEnabled;
  const isMicEnabled = localParticipant.isMicrophoneEnabled;
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const toggleMic = useCallback(async () => {
    await room.localParticipant.setMicrophoneEnabled(!isMicEnabled);
  }, [room, isMicEnabled]);

  const toggleCamera = useCallback(async () => {
    await room.localParticipant.setCameraEnabled(!isCameraEnabled);
  }, [room, isCameraEnabled]);

  const flipCamera = useCallback(async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    await room.localParticipant.setCameraEnabled(false);
    await room.localParticipant.setCameraEnabled(true, {
      facingMode: newMode,
    });
  }, [room, facingMode]);

  // Only mirror the front-facing camera
  const videoStyle = {
    width: "100%",
    ...(facingMode === "user" ? { transform: "scaleX(-1)" } : {}),
  };

  return (
    <div className="flex flex-col items-center w-full h-full flex-1 relative">
      {/* Floating camera PiP overlay */}
      {isCameraEnabled && cameraPublication?.track && (
        <div className="absolute top-2 right-2 z-20 w-32 h-24 rounded-xl overflow-hidden border-2 border-zinc-600 shadow-lg shadow-black/40">
          <VideoTrack
            trackRef={{
              participant: localParticipant.localParticipant,
              publication: cameraPublication,
              source: Track.Source.Camera,
            }}
            style={{ width: "100%", height: "100%", objectFit: "cover", ...(facingMode === "user" ? { transform: "scaleX(-1)" } : {}) }}
          />
          <button
            onClick={flipCamera}
            className="absolute bottom-1 right-1 bg-black/60 rounded-full p-1 hover:bg-black/80 transition-colors"
            title="Flip camera"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
              <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
              <circle cx="12" cy="12" r="3" />
              <path d="m18 22-3-3 3-3" />
              <path d="m6 2 3 3-3 3" />
            </svg>
          </button>
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-4 pb-4">
        {cameraRequest && !isCameraEnabled && (
          <div className="w-full max-w-md flex items-center justify-between bg-orange-900/50 rounded-lg px-4 py-3 border border-orange-700 animate-pulse">
            <span className="text-orange-200">Chef Claude wants to see what you're working on</span>
            <div className="flex gap-2">
              <button
                onClick={enableCameraFromRequest}
                className="rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-medium hover:bg-orange-700 transition-colors"
              >
                Enable Camera
              </button>
              <button
                onClick={() => setCameraRequest(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm px-2"
              >
                No thanks
              </button>
            </div>
          </div>
        )}
        {dishSuggestions.length > 0 && (
          <DishSuggestions options={dishSuggestions} onSelect={selectDish} />
        )}
        {recipe && <RecipeCard recipe={recipe} onClose={() => setRecipe(null)} />}
        {groceryList.length > 0 && (
          <GroceryList
            items={groceryList}
            onToggle={toggleGroceryItem}
            forceExpanded={groceryListOpen}
            onClose={() => setGroceryListOpen(false)}
          />
        )}
        <TimerDisplay timers={timers} onDismiss={dismissTimer} />
      </div>

      {/* Fixed bottom area: visualizer + status + controls */}
      <div className="w-full flex flex-col items-center gap-4 pt-4 pb-2 shrink-0">
        <div className="h-36 w-full max-w-md">
          <BarVisualizer
            state={state}
            trackRef={audioTrack}
            barCount={5}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        <p className="text-lg capitalize text-zinc-400">
          {!isMicEnabled ? "Paused" : state}
        </p>

        {/* Controls */}
        <div className="flex items-center gap-4">
        <button
          onClick={toggleMic}
          className={`rounded-full p-4 transition-colors ${
            isMicEnabled
              ? "bg-zinc-700 hover:bg-zinc-600"
              : "bg-red-600 hover:bg-red-700"
          }`}
          title={isMicEnabled ? "Mute mic" : "Unmute mic"}
        >
          {isMicEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" x2="22" y1="2" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5.29" />
              <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </button>

        <button
          onClick={toggleCamera}
          className={`rounded-full p-4 transition-colors ${
            isCameraEnabled
              ? "bg-zinc-700 hover:bg-zinc-600"
              : "bg-zinc-800 hover:bg-zinc-700 border border-zinc-600"
          }`}
          title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {isCameraEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
              <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
              <line x1="2" x2="22" y1="2" y2="22" />
            </svg>
          )}
        </button>

        {groceryList.length > 0 && (
          <button
            onClick={() => setGroceryListOpen((o) => !o)}
            className={`rounded-full p-4 transition-colors relative ${
              groceryListOpen
                ? "bg-emerald-700 hover:bg-emerald-600"
                : "bg-zinc-800 hover:bg-zinc-700 border border-zinc-600"
            }`}
            title="Grocery list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {groceryList.reduce((sum, g) => sum + g.ingredients.length, 0)}
            </span>
          </button>
        )}

        <DisconnectButton className="rounded-full bg-red-600 p-4 hover:bg-red-700 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" x2="1" y1="1" y2="23" />
          </svg>
        </DisconnectButton>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [connectionDetails, setConnectionDetails] = useState<{
    token: string;
    url: string;
  } | null>(null);

  const connect = useCallback(async () => {
    const res = await fetch("/api/token");
    const details = await res.json();
    setConnectionDetails(details);
  }, []);

  return (
    <div className="flex h-screen flex-col items-center bg-zinc-950 text-white font-sans p-6">
      <h1 className="text-3xl font-bold tracking-tight shrink-0">Chef Claude</h1>
      <p className="text-zinc-400 text-base mb-4 shrink-0">Your AI cooking assistant</p>

      {!connectionDetails ? (
        <div className="flex-1 flex items-center">
          <button
            onClick={connect}
            className="rounded-full bg-orange-600 px-8 py-4 text-xl font-semibold hover:bg-orange-700 transition-colors"
          >
            Start Cooking
          </button>
        </div>
      ) : (
        <LiveKitRoom
          token={connectionDetails.token}
          serverUrl={connectionDetails.url}
          connect={true}
          audio={true}
          video={false}
          className="flex flex-col items-center w-full flex-1 min-h-0"
          onDisconnected={() => setConnectionDetails(null)}
        >
          <VoiceAssistantUI />
          <RoomAudioRenderer />
        </LiveKitRoom>
      )}
    </div>
  );
}
