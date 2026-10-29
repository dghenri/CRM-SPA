import React, { useEffect, useMemo, useState } from "react";
import UserServices from "./UserServices";
import { fetchServices } from "../../../api/services";
import { fetchMyFavorites, addFavorite, removeFavorite } from "../../../api/favorites";

import { SearchField, Modal, Button, Checkbox, Select, Label, ListBox, Slider } from "@heroui/react";
import { Check, Heart, ListFilter } from "lucide-react";

// Filtros ficam salvos na sessionStorage, então eles sobrevivem a uma
// navegação entre páginas (o componente desmonta e remonta) mas somem
// se o cliente fechar a aba - o que é o comportamento esperado pra um
// filtro de busca, ao contrário de uma preferência permanente.
const FILTERS_STORAGE_KEY = "services:filters";

function loadStoredFilters() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredFilters(filters) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // sessionStorage indisponível (modo privado etc.) - filtro simplesmente
    // não persiste, sem quebrar a página.
  }
}

const Services = () => {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState(
    () => loadStoredFilters()?.categories ?? []
  );
  const [selectedProfessional, setSelectedProfessional] = useState(
    () => loadStoredFilters()?.professional ?? null
  );

  // favoritos vêm do backend (GET /users/me/favorites) e são
  // sincronizados a cada toggle (POST/DELETE /users/me/favorites/:id)
  const [favorites, setFavorites] = useState([]);
  const [favoritesOnly, setFavoritesOnly] = useState(
    () => loadStoredFilters()?.favoritesOnly ?? false
  );

  const [priceRange, setPriceRange] = useState(
    () => loadStoredFilters()?.priceRange ?? null
  );

  const PROFESSIONALS = ["Anne Grazielle", "Ana Clara"];

  useEffect(() => {
    let cancelled = false;

    fetchServices()
      .then((data) => {
        if (!cancelled) setServices(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Erro ao carregar procedimentos.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchMyFavorites()
      .then((favServices) => {
        if (!cancelled) setFavorites(favServices.map((s) => s.id));
      })
      .catch((err) => {
        // não bloqueia a página por causa dos favoritos - só loga
        console.error(err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Categorias disponíveis, geradas a partir dos serviços carregados.
  const categories = useMemo(
    () =>
      Array.from(new Set(services.map((s) => s.category).filter(Boolean))).sort(),
    [services]
  );

  // Faixa de preço disponível, calculada a partir dos procedimentos carregados.
  const priceBounds = useMemo(() => {
    const prices = services
      .map((s) => Number(s.price))
      .filter((p) => Number.isFinite(p));
    if (prices.length === 0) return [0, 0];
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
  }, [services]);

  useEffect(() => {
    if (priceBounds[1] <= priceBounds[0]) return;

    setPriceRange((prev) => {
      if (!prev) return priceBounds;
      const lo = Math.min(Math.max(prev[0], priceBounds[0]), priceBounds[1]);
      const hi = Math.min(Math.max(prev[1], priceBounds[0]), priceBounds[1]);
      return lo === prev[0] && hi === prev[1] ? prev : [lo, hi];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceBounds[0], priceBounds[1]]);

  // Persiste os filtros selecionados para sobreviverem a uma navegação
  // (ida e volta entre páginas) dentro da mesma sessão do navegador.
  useEffect(() => {
    saveStoredFilters({
      categories: selectedCategories,
      professional: selectedProfessional,
      favoritesOnly,
      priceRange,
    });
  }, [selectedCategories, selectedProfessional, favoritesOnly, priceRange]);

  const isPriceFiltered =
    priceRange !== null &&
    (priceRange[0] !== priceBounds[0] || priceRange[1] !== priceBounds[1]);

  const toggleCategory = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  // Toggle otimista: atualiza a UI na hora e só reverte se a chamada
  // ao backend falhar.
  const toggleFavorite = async (serviceId) => {
    const alreadyFavorited = favorites.includes(serviceId);

    setFavorites((prev) =>
      alreadyFavorited ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );

    try {
      if (alreadyFavorited) {
        await removeFavorite(serviceId);
      } else {
        await addFavorite(serviceId);
      }
    } catch (err) {
      console.error(err);
      setFavorites((prev) =>
        alreadyFavorited ? [...prev, serviceId] : prev.filter((id) => id !== serviceId)
      );
    }
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedProfessional(null);
    setFavoritesOnly(false);
    setPriceRange(priceBounds);
  };

  const activeFilterCount =
    selectedCategories.length +
    (selectedProfessional ? 1 : 0) +
    (favoritesOnly ? 1 : 0) +
    (isPriceFiltered ? 1 : 0);

  return (
    <div className="flex h-full flex-col pt-35">
      {/* HEAD */}
      <div className="fixed inset-x-0 top-0 z-30 items-center justify-between bg-overlay border-b border-border/50">
        <div className="p-5 pb-0">
          <h2 className="font-serif text-2xl font-bold text-foreground">Procedimentos</h2>
        </div>

        {/* Busca e filtro lado a lado */}
        <div className="flex items-center gap-3 p-4">
          <SearchField
            aria-label="Search services"
            name="search"
            value={searchQuery}
            onChange={setSearchQuery}
            className="flex-1"
          >
            <SearchField.Group className="rounded-full bg-surface-secondary">
              <SearchField.SearchIcon />
              <SearchField.Input className="w-full" placeholder="Buscar procedimento..." />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>

          <Modal>
            <Button variant="outline" className="bg-overlay shrink-0">
              <ListFilter />
              Filtros
              {activeFilterCount > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Modal.Backdrop>
              <Modal.Container>
                <Modal.Dialog className="sm:max-w-90">
                  <Modal.CloseTrigger />
                  <Modal.Header className="mb-4">
                    <Modal.Icon className="bg-default text-foreground">
                      <ListFilter className="size-5" />
                    </Modal.Icon>
                    <Modal.Heading>Filtrar procedimentos</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <Button
                      variant="outline"
                      onPress={() => setFavoritesOnly((v) => !v)}
                      className={`rounded-full border-none ${
                        favoritesOnly
                          ? "bg-foreground text-background"
                          : "bg-surface-secondary text-foreground"
                      }`}
                    >
                      {favoritesOnly ? <Check className="size-4" /> : <Heart className="size-4" />}
                      Somente favoritos
                    </Button>

                    {priceRange && (
                      <div className="mt-5">
                        <Slider
                          value={priceRange}
                          onChange={setPriceRange}
                          minValue={priceBounds[0]}
                          maxValue={priceBounds[1]}
                          step={1}
                          formatOptions={{
                            style: "currency",
                            currency: "BRL",
                            maximumFractionDigits: 0,
                          }}
                        >
                          <Label>Faixa de preço</Label>
                          <Slider.Output />
                          <Slider.Track>
                            {({ state }) => (
                              <>
                                <Slider.Fill />
                                {state.values.map((_, i) => (
                                  <Slider.Thumb className="bg-white" key={i} index={i} />
                                ))}
                              </>
                            )}
                          </Slider.Track>
                        </Slider>
                      </div>
                    )}

                    {categories.length > 0 ? (
                      <div className="mt-5 flex flex-col gap-3">
                        {categories.map((category) => (
                          <Checkbox
                            key={category}
                            isSelected={selectedCategories.includes(category)}
                            onChange={() => toggleCategory(category)}
                          >
                            {category}
                          </Checkbox>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-5 text-sm text-muted">
                        Nenhuma categoria disponível no momento.
                      </p>
                    )}

                    <Select
                      aria-label="Filtrar por profissional"
                      placeholder="Selecione um profissional"
                      className="mt-4"
                      value={selectedProfessional}
                      onChange={setSelectedProfessional}
                    >
                      <Label>Profissional</Label>
                      <Select.Trigger className="bg-surface-secondary border border-border">
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {PROFESSIONALS.map((name) => (
                            <ListBox.Item key={name} id={name} textValue={name}>
                              {name}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="tertiary"
                      className="flex-1"
                      onPress={clearFilters}
                      isDisabled={activeFilterCount === 0}
                    >
                      Limpar
                    </Button>
                    <Button className="flex-1" slot="close">
                      Aplicar
                    </Button>
                  </Modal.Footer>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </Modal>
        </div>
      </div>

      <div className="">
        <UserServices
          services={services}
          isLoading={isLoading}
          loadError={loadError}
          searchQuery={searchQuery}
          categoryFilter={selectedCategories}
          professionalFilter={selectedProfessional}
          priceRange={priceRange}
          favoritesOnly={favoritesOnly}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    </div>
  );
};

export default Services;
