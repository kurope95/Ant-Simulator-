import { mix32 } from "../core/rng.js";

// Female first names, plain ASCII, no repeats. The list length is 64 so that
// the multiplier below is coprime to it and each block of 64 uids gets 64
// distinct names.
const kNames: readonly string[] = [
  "Ada", "Agnes", "Alma", "Anna", "Beatrice", "Bella", "Berta", "Clara",
  "Dora", "Edith", "Elin", "Ella", "Elsa", "Emma", "Esther", "Eva",
  "Fanny", "Flora", "Freya", "Gerda", "Greta", "Hanna", "Hazel", "Helga",
  "Hilda", "Ida", "Ilse", "Inga", "Iris", "Ivy", "Jade", "Jana",
  "Judith", "Junia", "Kara", "Kira", "Lena", "Lila", "Lilly", "Lotte",
  "Luna", "Maeve", "Mara", "Mina", "Mira", "Nadia", "Nell", "Nina",
  "Nora", "Olga", "Opal", "Petra", "Pia", "Rita", "Rosa", "Ruth",
  "Sana", "Sara", "Selma", "Sigrid", "Tara", "Tessa", "Vera", "Wanda",
];

const kMultiplier = 29;

// Pure and deterministic: the same uid always gives the same name. Within each
// block of 64 consecutive uids every name appears once; later blocks reuse the
// names with a number after them, so the first 1000 uids are all distinct.
export function antName(uid: number): string {
  const count = kNames.length;
  const block = Math.floor(uid / count);
  const slot = uid % count;
  const index = (slot * kMultiplier + mix32(block + 1)) % count;
  const base = kNames[index];
  return block === 0 ? base : `${base} ${block + 1}`;
}
