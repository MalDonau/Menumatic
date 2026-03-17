import { useEffect, useMemo, useState, useRef } from 'react';
import * as Icons from 'lucide-react';
import { nanoid } from 'nanoid';
import {
  sampleDishes,
  weeklySlots,
  type Dish,
  type MealType,
  type PlannedMeal,
} from './data/meals';

const DISHES_STORAGE_KEY = 'maldonado-menu-dishes';
const PLAN_STORAGE_KEY = 'maldonado-menu-weekly-plan';
const REQUIRED_WEEKLY_PROTEINS = weeklySlots.length;

type FormState = {
  name: string;
  protein: string;
  mealType: 'ambos' | MealType;
  notes: string;
};

const emptyForm: FormState = {
  name: '',
  protein: 'Carne',
  mealType: 'ambos',
  notes: '',
};

function normalizeProtein(protein: string) {
  return (protein || '').trim().toLowerCase();
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[randomIndex];
    copy[randomIndex] = current;
  }
  return copy;
}

function App() {
  const [isReady, setIsReady] = useState(false);
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [dishes, setDishes] = useState<Dish[]>(sampleDishes);
  const [weeklyPlan, setWeeklyPlan] = useState<PlannedMeal[]>(
    weeklySlots.map((slot) => ({ ...slot, dish: null })),
  );
  const [isDietMode, setIsDietMode] = useState(false);

  const formRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const savedDishes = window.localStorage.getItem(DISHES_STORAGE_KEY);
      if (savedDishes) {
        const parsed = JSON.parse(savedDishes);
        if (Array.isArray(parsed)) setDishes(parsed);
      }

      const savedPlan = window.localStorage.getItem(PLAN_STORAGE_KEY);
      if (savedPlan) {
        const parsed = JSON.parse(savedPlan);
        if (Array.isArray(parsed)) setWeeklyPlan(parsed);
      }
    } catch (e) {
      console.error(e);
      window.localStorage.clear();
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(DISHES_STORAGE_KEY, JSON.stringify(dishes));
  }, [dishes, isReady]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(weeklyPlan));
  }, [weeklyPlan, isReady]);

  const proteinCount = useMemo(() => {
    return new Set(dishes.map((dish) => normalizeProtein(dish.protein))).size;
  }, [dishes]);

  const missingSlots = useMemo(() => {
    return weeklyPlan.filter((meal) => meal.dish === null);
  }, [weeklyPlan]);

  const lunchCount = dishes.filter((dish) => (dish.mealTypes || []).includes('almuerzo')).length;
  const dinnerCount = dishes.filter((dish) => (dish.mealTypes || []).includes('cena')).length;

  if (!isReady) return null;

  function handleSaveDish(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.protein.trim()) return;

    if (editingDishId) {
      setDishes((current) =>
        current.map((dish) =>
          dish.id === editingDishId
            ? {
                ...dish,
                name: form.name.trim(),
                protein: form.protein.trim(),
                mealTypes:
                  form.mealType === 'ambos' ? ['almuerzo', 'cena'] : [form.mealType],
                notes: form.notes.trim(),
              }
            : dish
        )
      );
      setWeeklyPlan((current) =>
        current.map((meal) =>
          meal.dish?.id === editingDishId
            ? {
                ...meal,
                dish: {
                  ...meal.dish,
                  name: form.name.trim(),
                  protein: form.protein.trim(),
                  mealTypes:
                    form.mealType === 'ambos' ? ['almuerzo', 'cena'] : [form.mealType],
                  notes: form.notes.trim(),
                },
              }
            : meal
        )
      );
      setEditingDishId(null);
    } else {
      const nextDish: Dish = {
        id: nanoid(),
        name: form.name.trim(),
        protein: form.protein.trim(),
        mealTypes: form.mealType === 'ambos' ? ['almuerzo', 'cena'] : [form.mealType],
        notes: form.notes.trim(),
      };
      setDishes((current) => [nextDish, ...current]);
    }
    setForm(emptyForm);
  }

  function handleEditClick(dish: Dish) {
    setEditingDishId(dish.id);
    setForm({
      name: dish.name,
      protein: dish.protein,
      mealType: dish.mealTypes.length > 1 ? 'ambos' : (dish.mealTypes[0] as MealType),
      notes: dish.notes,
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleCancelEdit() {
    setEditingDishId(null);
    setForm(emptyForm);
  }

  function handleDeleteDish(dishId: string) {
    setDishes((current) => current.filter((dish) => dish.id !== dishId));
    setWeeklyPlan((current) =>
      current.map((meal) =>
        meal.dish?.id === dishId ? { ...meal, dish: null } : meal
      )
    );
  }

  function handleGeneratePlan() {
    const generate = (): PlannedMeal[] => {
      const plan: PlannedMeal[] = [];
      const usedInDay: Record<string, string[]> = {};
      const usedDishIds = new Set<string>();
      const days = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];

      const heavyProteins = ['carne', 'cerdo', 'pollo'];

      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        const prevDay = i > 0 ? days[i - 1] : null;
        usedInDay[day] = [];
        const prevDayProteins = prevDay ? usedInDay[prevDay] : [];

        const daySlots = weeklySlots.filter(s => s.day === day);
        for (const slot of daySlots) {
          const candidates = shuffle(dishes).filter(dish => {
            if (!dish.mealTypes.includes(slot.mealType)) return false;
            if (usedDishIds.has(dish.id)) return false;
            
            const p = normalizeProtein(dish.protein);
            const isException = p === 'huevo' || p === 'otro';
            
            // Regla principal: no repetir proteina exacta en el dia
            if (usedInDay[day].includes(p)) return false;
            
            // Regla modo DIET: solo una "pesada" (carne/pollo/cerdo) por dia
            if (isDietMode && heavyProteins.includes(p)) {
              const hasHeavyAlready = usedInDay[day].some(usedP => heavyProteins.includes(usedP));
              if (hasHeavyAlready) return false;
            }

            // Regla dia anterior: no repetir (excepto huevo/otro)
            if (!isException && prevDayProteins.includes(p)) return false;
            
            return true;
          });

          const choice = candidates[0];
          if (choice) {
            plan.push({ ...slot, dish: choice });
            usedInDay[day].push(normalizeProtein(choice.protein));
            usedDishIds.add(choice.id);
          } else {
            plan.push({ ...slot, dish: null });
          }
        }
      }
      return plan;
    };

    let bestPlan = generate();
    let bestCount = bestPlan.filter(p => p.dish).length;

    for (let i = 0; i < 50; i++) {
      const newPlan = generate();
      const newCount = newPlan.filter(p => p.dish).length;
      if (newCount > bestCount) {
        bestPlan = newPlan;
        bestCount = newCount;
        if (bestCount === weeklySlots.length) break;
      }
    }
    setWeeklyPlan(bestPlan);
  }

  function handleRerollSlot(day: string, mealType: MealType) {
    const heavyProteins = ['carne', 'cerdo', 'pollo'];
    const days = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
    const currentDayIdx = days.indexOf(day);
    
    // Identificar platos y proteinas usados en otros slots
    const otherMeals = weeklyPlan.filter(m => !(m.day === day && m.mealType === mealType));
    const usedDishIds = new Set(otherMeals.map(m => m.dish?.id).filter(Boolean));
    
    // Proteinas en el mismo dia (el otro turno)
    const sameDayProteins = otherMeals.filter(m => m.day === day).map(m => normalizeProtein(m.dish?.protein || ''));
    
    // Proteinas dia anterior
    const prevDay = currentDayIdx > 0 ? days[currentDayIdx - 1] : null;
    const prevDayProteins = otherMeals.filter(m => m.day === prevDay).map(m => normalizeProtein(m.dish?.protein || ''));
    
    // Proteinas dia siguiente (importante para no romper la cadena)
    const nextDay = currentDayIdx < days.length - 1 ? days[currentDayIdx + 1] : null;
    const nextDayProteins = otherMeals.filter(m => m.day === nextDay).map(m => normalizeProtein(m.dish?.protein || ''));

    const candidates = shuffle(dishes).filter(dish => {
      if (!dish.mealTypes.includes(mealType)) return false;
      if (usedDishIds.has(dish.id)) return false;

      const p = normalizeProtein(dish.protein);
      const isException = p === 'huevo' || p === 'otro';

      // No repetir en el mismo dia
      if (sameDayProteins.includes(p)) return false;

      // Regla modo DIET: si el otro turno tiene carne, este no puede
      if (isDietMode && heavyProteins.includes(p)) {
        const hasHeavyInDay = sameDayProteins.some(usedP => heavyProteins.includes(usedP));
        if (hasHeavyInDay) return false;
      }

      // No repetir con dia anterior ni siguiente (excepto huevo/otro)
      if (!isException) {
        if (prevDayProteins.includes(p)) return false;
        if (nextDayProteins.includes(p)) return false;
      }

      return true;
    });

    const choice = candidates[0];
    if (choice) {
      setWeeklyPlan(current => current.map(m => 
        (m.day === day && m.mealType === mealType) ? { ...m, dish: choice } : m
      ));
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero__badge">
          <Icons.ChefHat size={18} />
          <span>Menu semanal</span>
        </div>
        <div className="hero__title-container">
          <h1 className="hero__title">Menumatic</h1>
          <div className="particles">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="particle" style={{
                // Distribucion fija para evitar que se amontonen
                left: `${(i * 18) + 5}%`, 
                animationDelay: `${i * 0.8}s`,
                animationDuration: `${7 + Math.random() * 3}s`
              }}>
                {['🍎', '🍕', '🍔', '🥗', '🍗', '🍲'][i]}
              </div>
            ))}
          </div>
        </div>
        <div className="hero__stats">
          <article><span>Platos</span><strong>{dishes.length}</strong></article>
          <article><span>Proteinas</span><strong>{proteinCount}</strong></article>
          <article><span>Almuerzos</span><strong>{lunchCount}</strong></article>
          <article><span>Cenas</span><strong>{dinnerCount}</strong></article>
        </div>
      </header>

      <main className="layout">
        <section className="panel panel--generator">
          <div className="panel__header">
            <h2>Semana aleatoria</h2>
            <div className="panel__actions">
              <button 
                className={`button ${isDietMode ? 'button--success' : 'button--ghost'}`} 
                onClick={() => setIsDietMode(!isDietMode)}
                title="Solo una carne/pollo/cerdo por dia"
              >
                <Icons.Apple size={18} />
                Diet {isDietMode ? 'ON' : 'OFF'}
              </button>
              <button className="button button--primary" onClick={handleGeneratePlan}><Icons.Dices size={18} /> Random</button>
              <button className="button button--ghost" onClick={() => setWeeklyPlan(weeklySlots.map(s => ({...s, dish: null})))}>Limpiar</button>
            </div>
          </div>

          <div className="info-strip">
            {missingSlots.length > 0 ? (
              <p className="warning">Faltan {missingSlots.length} comidas. Necesitas más proteínas distintas.</p>
            ) : (
              <p className="success">¡Semana completa!</p>
            )}
          </div>

          <div className="week-grid">
            <div className="week-grid__header">
              <span>Almuerzo</span>
              <span>Cena</span>
            </div>
            {['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'].map((day, dayIdx) => (
              <div key={day} className={`week-day-row ${dayIdx % 2 === 0 ? 'week-day-row--alt' : ''}`}>
                <span className="week-day-label">{day}</span>
                {weeklyPlan.filter(m => m.day === day).map((meal, idx) => (
                  <article className="meal-card" key={`${day}-${idx}`}>
                    <div className="meal-card__topline" style={{ marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                        {meal.mealType.toUpperCase()}
                      </span>
                    </div>

                    {meal.dish ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                          <h3 style={{ fontSize: '1rem', lineHeight: '1.2', margin: 0 }}>{meal.dish.name}</h3>
                          <button 
                            className="button button--ghost icon-button" 
                            style={{ padding: '4px', borderRadius: '8px', minHeight: 'auto', width: '28px', height: '28px' }}
                            onClick={() => handleRerollSlot(meal.day, meal.mealType)}
                            title="Cambiar este plato"
                          >
                            <Icons.RotateCw size={14} />
                          </button>
                        </div>
                        <p className="meal-card__protein" style={{ transform: 'scale(0.8)', transformOrigin: 'left', marginTop: '4px' }}>
                          {meal.dish.protein}
                        </p>
                      </>
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sin asignar</p>
                    )}
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel--form" ref={formRef}>
          <h2>{editingDishId ? 'Editar plato' : 'Nuevo plato'}</h2>
          <form className="dish-form" onSubmit={handleSaveDish}>
            <label className="field"><span>Nombre</span><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Tarta de atun" /></label>
            <label className="field">
              <span>Proteina principal</span>
              <select
                value={form.protein}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
              >
                <option value="Carne">Carne</option>
                <option value="Pollo">Pollo</option>
                <option value="Cerdo">Cerdo</option>
                <option value="Pescado">Pescado</option>
                <option value="Huevo">Huevo</option>
                <option value="Otro">Otro</option>
              </select>
            </label>
            <label className="field"><span>Momento</span>
              <select value={form.mealType} onChange={e => setForm({...form, mealType: e.target.value as any})}>
                <option value="ambos">Almuerzo y cena</option>
                <option value="almuerzo">Solo almuerzo</option>
                <option value="cena">Solo cena</option>
              </select>
            </label>
            <label className="field field--full"><span>Notas</span><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></label>
            <div className="panel__actions" style={{ marginTop: '10px' }}>
              <button className="button button--primary" type="submit">
                {editingDishId ? <Icons.Save size={18} /> : <Icons.Plus size={18} />}
                {editingDishId ? 'Actualizar' : 'Guardar'}
              </button>
              {editingDishId && (
                <button className="button button--ghost" type="button" onClick={handleCancelEdit}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel panel--full">
          <h2>Biblioteca de platos</h2>
          <div className="dish-list">
            {dishes.map((dish) => (
              <article className="dish-card" key={dish.id}>
                <div className="dish-card__content">
                  <h3>{dish.name}</h3>
                  <span className="protein-pill">{dish.protein}</span>
                  <p className="dish-card__meta">{dish.mealTypes.join(' y ')}</p>
                </div>
                <div className="dish-card__actions" style={{ display: 'flex', gap: '8px' }}>
                  <button className="button button--ghost" onClick={() => handleEditClick(dish)}>
                    <Icons.Edit3 size={18} />
                  </button>
                  <button className="button button--ghost button--danger" onClick={() => handleDeleteDish(dish.id)}>
                    <Icons.Trash2 size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
