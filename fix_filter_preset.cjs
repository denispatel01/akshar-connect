const fs = require('fs');
let content = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

const regex = /useEffect\(\(\) => \{\s*if \(!devoteesPreset \|\| !PRESET_META\[devoteesPreset\]\) return;\s*const \{ tags \} = PRESET_META\[devoteesPreset\];\s*setSelectedTags\(tags \|\| \[\]\);\s*setFilterKaryakarta\(''\);\s*setFilterArea\(''\);\s*setFilterWing\(''\);\s*setFilterBlood\(''\);\s*setFilterGender\(''\);\s*setSearchQuery\(''\);\s*setShowTagFilter\(devoteesPreset === 'ambrish'\);\s*\}, \[devoteesPreset\]\);/;

const newCode = `useEffect(() => {
    if (devoteesPreset && PRESET_META[devoteesPreset]) {
      const { tags } = PRESET_META[devoteesPreset];
      setSelectedTags(tags || []);
      setFilterKaryakarta('');
      setFilterArea('');
      setFilterWing('');
      setFilterBlood('');
      setFilterGender('');
      setSearchQuery('');
      setShowTagFilter(devoteesPreset === 'ambrish');
    }
  }, [devoteesPreset]);

  useEffect(() => {
    if (filterPreset) {
      if (filterPreset.karyakarta) setFilterKaryakarta(filterPreset.karyakarta);
      else setFilterKaryakarta('');
      
      if (filterPreset.area) setFilterArea(filterPreset.area);
      else setFilterArea('');
      
      if (filterPreset.wing) setFilterWing(filterPreset.wing);
      else setFilterWing('');
      
      setSelectedTags([]); // clear tags when applying these filters
      setSearchQuery('');
      setShowTagFilter(true);
    }
  }, [filterPreset]);`;

content = content.replace(regex, newCode);
fs.writeFileSync('src/pages/DevoteesPage.jsx', content, 'utf8');
console.log('Fixed filterPreset useEffect');
