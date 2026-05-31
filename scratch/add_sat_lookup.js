const fs = require('fs');
const file = 'src/components/pos/SatCatalogSelect.tsx';
let c = fs.readFileSync(file, 'utf8');

const target = `useEffect(() => {
    setQuery(nameValue || value || "");
  }, [nameValue, value]);`;

const replacement = `useEffect(() => {
    let mounted = true;
    if (value && !nameValue) {
      // Auto-lookup the name if we only have the code (e.g. from CSV import)
      const fetchName = async () => {
        setLoading(true);
        try {
          const data = type === "product" ? await searchSatProducts(value) : await searchSatUnits(value);
          if (!mounted) return;
          const match = (data || []).find((r: any) => r.Value === value);
          if (match) {
            setQuery(match.Name);
            onChange(value, match.Name);
          } else {
            setQuery(value);
          }
        } catch (e) {
          if (mounted) setQuery(value);
        } finally {
          if (mounted) setLoading(false);
        }
      };
      fetchName();
    } else {
      setQuery(nameValue || value || "");
    }
    return () => { mounted = false; };
  }, [value, nameValue, type]); // removed onChange to prevent loop if it's not memoized`;

c = c.replace(target, replacement);

fs.writeFileSync(file, c, 'utf8');
console.log('Added auto-lookup for SAT names on mount');
