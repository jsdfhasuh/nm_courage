# Only these explicitly supplied --arg values can reach the public JSON file.
def trimmed: gsub("^\\s+|\\s+$"; "");
def invalid($name): error("Invalid " + $name);
def money($name):
  trimmed | if test("^[0-9]+(\\.[0-9]+)?$") then tonumber else invalid($name) end
  | if . > 0 and . <= 1000000000 then . else invalid($name) end;
def time($name): trimmed | if test("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$") then . else invalid($name) end;
def boolean($name):
  trimmed | ascii_downcase | if . == "true" then true elif . == "false" then false else invalid($name) end;
def days:
  split(",") | map(trimmed | if test("^[0-6]$") then tonumber else invalid("NM_WORKDAYS") end)
  | unique | if length > 0 then . else invalid("NM_WORKDAYS") end;
def minutes: split(":") | (.[0] | tonumber) * 60 + (.[1] | tonumber);
def defaults: {salaryType:"monthly", salary:12000, start:"09:00", end:"18:00", breakEnabled:true, breakStart:"12:00", breakEnd:"13:30", workdays:[1,2,3,4,5]};

({}
  + (if ($salaryType | trimmed) == "" then {} else {salaryType: ($salaryType | trimmed | if . == "monthly" or . == "daily" then . else invalid("NM_SALARY_TYPE") end)} end)
  + (if ($salary | trimmed) == "" then {} else {salary: ($salary | money("NM_SALARY"))} end)
  + (if ($start | trimmed) == "" then {} else {start: ($start | time("NM_WORK_START"))} end)
  + (if ($end | trimmed) == "" then {} else {end: ($end | time("NM_WORK_END"))} end)
  + (if ($breakEnabled | trimmed) == "" then {} else {breakEnabled: ($breakEnabled | boolean("NM_BREAK_ENABLED"))} end)
  + (if ($breakStart | trimmed) == "" then {} else {breakStart: ($breakStart | time("NM_BREAK_START"))} end)
  + (if ($breakEnd | trimmed) == "" then {} else {breakEnd: ($breakEnd | time("NM_BREAK_END"))} end)
  + (if ($workdays | trimmed) == "" then {} else {workdays: ($workdays | days)} end)
) as $settings
| ({}
  + (if ($goalName | trimmed) == "" then {} else {name: ($goalName | trimmed | if length <= 24 then . else invalid("NM_GOAL_NAME") end)} end)
  + (if ($goalPrice | trimmed) == "" then {} else {price: ($goalPrice | money("NM_GOAL_PRICE"))} end)
) as $goal
| (defaults + $settings) as $s
| ($s.start | minutes) as $a
| ($s.end | minutes) as $endMinute
| ($endMinute + (if $endMinute < $a then 1440 else 0 end)) as $b
| if $a == $endMinute then invalid("NM_WORK_START/NM_WORK_END") else . end
| if $s.breakEnabled then
    ($s.breakStart | minutes) as $bs0
    | ($s.breakEnd | minutes) as $be0
    | ($bs0 + (if $bs0 < $a then 1440 else 0 end)) as $bs
    | ($be0 + (if $be0 < $a then 1440 else 0 end)) as $be
    | if $be <= $bs or $bs < $a or $be > $b or ($be - $bs) >= ($b - $a)
      then invalid("NM_BREAK_START/NM_BREAK_END for the configured shift") else . end
  else . end
| (if ($settings | length) > 0 then {settings:$settings} else {} end)
  + (if ($goal | length) > 0 then {goal:$goal} else {} end)
