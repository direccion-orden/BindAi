const fs = require('fs');

let f = 'src/app/(dashboard)/clientes/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Add Eye icon
c = c.replace(/Trash2, Users, Building/g, 'Trash2, Users, Building, Eye');

// 2. Add isViewing state
c = c.replace('const [isEditing, setIsEditing] = useState(false);', 'const [isEditing, setIsEditing] = useState(false);\n  const [isViewing, setIsViewing] = useState(false);');

// 3. Update handleOpenForm
c = c.replace('const handleOpenForm = (client?: Client) => {', 'const handleOpenForm = (client?: Client, viewMode = false) => {');
let setFormDataStr = `setFormData(client);`;
let newSetFormDataStr = `setFormData({\n        ...client,\n        name: client.LegalName || client.CommercialName || client.name || "",\n        email: client.Email || client.email || "",\n        phone: client.Phone || client.phone || "",\n        rfc: client.RFC || client.rfc || "",\n      });`;
c = c.replace(setFormDataStr, newSetFormDataStr);
c = c.replace('setIsEditing(true);\n    };', 'setIsEditing(true);\n      setIsViewing(viewMode);\n    };');

// 4. Update handleCloseForm
c = c.replace('setIsEditing(false);', 'setIsEditing(false);\n      setIsViewing(false);');

// 5. Update title
c = c.replace('{currentId ? "Editar Cliente" : "Nuevo Cliente"}', '{currentId ? (isViewing ? "Ver Cliente" : "Editar Cliente") : "Nuevo Cliente"}');

// 6. Update buttons
let buttonsStr = `<Button type="button" variant="ghost" onClick={handleCloseForm}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Cliente
              </Button>`;
let newButtonsStr = `<Button type="button" variant={isViewing ? "default" : "ghost"} onClick={handleCloseForm}>{isViewing ? "Cerrar" : "Cancelar"}</Button>
              {!isViewing && (
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cliente
                </Button>
              )}`;
c = c.replace(buttonsStr, newButtonsStr);

// 7. Add disabled to all inputs and selects
c = c.replace(/<Input /g, '<Input disabled={isViewing} ');
c = c.replace(/<select/g, '<select disabled={isViewing}');

// 8. Add Eye button
let editBtnStr = `<Button variant="ghost" size="icon" onClick={() => handleOpenForm(c)}>\n                          <Edit2 className="w-4 h-4" />\n                        </Button>`;
let newEditBtnStr = `<Button variant="ghost" size="icon" onClick={() => handleOpenForm(c, true)} title="Ver Cliente">\n                          <Eye className="w-4 h-4" />\n                        </Button>\n                        ` + editBtnStr;
c = c.replace(editBtnStr, newEditBtnStr);

fs.writeFileSync(f, c, 'utf8');
console.log('Fixed clientes UI completely');
